import logging
import json
import asyncio
from datetime import datetime, timezone, timedelta
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

logger = logging.getLogger(__name__)

class YouTubeService:
    def __init__(self, config_loader):
        self.config_loader = config_loader

    def _get_credentials(self):
        config = self.config_loader()
        yt_cfg = config.get("youtube", {})
        oauth_creds = yt_cfg.get("oauth_credentials")
        
        if not oauth_creds:
            return None
            
        try:
            creds = Credentials(
                token=oauth_creds.get("token"),
                refresh_token=oauth_creds.get("refresh_token"),
                token_uri=oauth_creds.get("token_uri"),
                client_id=oauth_creds.get("client_id"),
                client_secret=oauth_creds.get("client_secret"),
                scopes=oauth_creds.get("scopes", [])
            )
            # We don't worry about refresh here, the discovery build handles it
            # or the oauth process handles it in bot_service/auth_service
            return creds
        except Exception as e:
            logger.error(f"Failed to load YouTube credentials: {e}")
            return None

    def _build_service_sync(self, creds=None, api_key=None):
        if creds:
            return build('youtube', 'v3', credentials=creds)
        if api_key:
            return build('youtube', 'v3', developerKey=api_key)
        return None

    async def add_moderator(self, channel_id_to_mod):
        """Adds a moderator to the authenticated user's YouTube channel."""
        config = self.config_loader()
        if not config.get("youtube", {}).get("moderation_enabled", False):
            return False, "YouTube Automated Moderation is currently disabled in settings."
            
        return await asyncio.to_thread(self._add_moderator_sync, channel_id_to_mod)

    def _add_moderator_sync(self, channel_id_to_mod):
        creds = self._get_credentials()
        if not creds:
            return False, "Not authenticated with YouTube. Please log in via the dashboard."

        try:
            service = build('youtube', 'v3', credentials=creds)
            
            # First fetch the active broadcast to get the liveChatId
            request = service.liveBroadcasts().list(
                part="snippet",
                broadcastStatus="active",
                broadcastType="all"
            )
            response = request.execute()
            
            items = response.get("items", [])
            
            # If no active stream, try upcoming
            if not items:
                request = service.liveBroadcasts().list(
                    part="snippet",
                    broadcastStatus="upcoming",
                    broadcastType="all"
                )
                response = request.execute()
                items = response.get("items", [])
                
            if not items:
                return False, "No active or upcoming live stream found. Cannot add moderator."
                
            live_chat_id = items[0]["snippet"]["liveChatId"]
            
            # Now insert the moderator
            mod_request = service.liveChatModerators().insert(
                part="snippet",
                body={
                  "snippet": {
                    "liveChatId": live_chat_id,
                    "moderatorDetails": {
                      "channelId": channel_id_to_mod
                    }
                  }
                }
            )
            mod_response = mod_request.execute()
            
            mod_id = mod_response.get("id")
            
            logger.info(f"Successfully added moderator: {channel_id_to_mod} (Mod ID: {mod_id})")
            return True, mod_id
            
        except Exception as e:
            logger.error(f"YouTube Mod Add Error: {e}")
            if "force-ssl" in str(e):
                return False, "Missing permissions. Please re-authenticate YouTube in the dashboard."
            return False, f"YouTube API Error: {str(e)}"

    async def remove_moderator(self, mod_id):
        """Removes a moderator using their specific Mod ID.
        Note: No moderation_enabled check here — revocation is a cleanup action
        that should always be allowed, even if auto-mod granting is disabled.
        """
        if not mod_id:
            return False, "No mod_id provided — cannot revoke."
        return await asyncio.to_thread(self._remove_moderator_sync, mod_id)

    def _remove_moderator_sync(self, mod_id):
        creds = self._get_credentials()
        if not creds:
            return False, "Not authenticated with YouTube."

        try:
            service = build('youtube', 'v3', credentials=creds)
            request = service.liveChatModerators().delete(
                id=mod_id
            )
            request.execute()
            logger.info(f"Successfully removed moderator ID: {mod_id}")
            return True, "Moderator removed."
            
        except Exception as e:
            logger.error(f"YouTube Mod Remove Error: {e}")
            return False, f"YouTube API Error: {str(e)}"

    async def send_chat_message(self, message: str, live_chat_id: str = None):
        """Sends a message directly to YouTube live chat."""
        return await asyncio.to_thread(self._send_chat_message_sync, message, live_chat_id)

    def _send_chat_message_sync(self, message: str, live_chat_id: str = None):
        creds = self._get_credentials()
        if not creds:
            return False, "Not authenticated with YouTube."

        try:
            service = build('youtube', 'v3', credentials=creds)
            
            if not live_chat_id:
                config = self.config_loader()
                live_chat_id = config.get("youtube", {}).get("live_chat_id")
            
            if not live_chat_id:
                # Fallback to fetching it
                request = service.liveBroadcasts().list(
                    part="snippet",
                    broadcastStatus="active",
                    broadcastType="all"
                )
                response = request.execute()
                items = response.get("items", [])
                
                if not items:
                    return False, "No active live stream found."
                    
                live_chat_id = items[0]["snippet"]["liveChatId"]
                
            insert_request = service.liveChatMessages().insert(
                part="snippet",
                body={
                    "snippet": {
                        "liveChatId": live_chat_id,
                        "type": "textMessageEvent",
                        "textMessageDetails": {
                            "messageText": message
                        }
                    }
                }
            )
            insert_request.execute()
            return True, "Message sent"
            
        except Exception as e:
            logger.error(f"YouTube Chat Send Error: {e}")
            return False, f"Error: {str(e)}"

    async def fetch_trending_gaming(self):
        """Fetches top trending gaming videos and shorts over the last 24 hours, prioritizing small channels."""
        # Using a developer key is safer for general API calls if OAuth creds are missing.
        # But we'll try OAuth creds first, then fallback to API key if configured.
        creds = self._get_credentials()
        config = self.config_loader()
        
        service = None
        if creds:
             try:
                 service = await asyncio.to_thread(self._build_service_sync, creds=creds)
             except Exception as e:
                 logger.error(f"Failed to build YouTube service with OAuth: {e}")
        
        if not service:
            api_key = config.get("youtube", {}).get("api_key")
            if api_key:
                try:
                    service = await asyncio.to_thread(self._build_service_sync, api_key=api_key)
                except Exception as e:
                    logger.error(f"Failed to build YouTube service with API key: {e}")
                    return None
            else:
                 logger.error("No YouTube API Key or OAuth credentials available for fetching trending.")
                 return None

        try:
            # 1. Fetch Trending Gaming Videos
            # videoCategoryId = 20 is for Gaming.
            # chart = mostPopular gives trending.
            request = service.videos().list(
                part="snippet,statistics,contentDetails",
                chart="mostPopular",
                videoCategoryId="20",
                regionCode="IN", # Or make configurable, default to India as requested 'TG' usually points to IN context or user preference.
                maxResults=50
            )
            response = await asyncio.to_thread(request.execute)
            
            items = response.get("items", [])
            
            # 2. Filter for last 24 hours
            now = datetime.now(timezone.utc)
            one_day_ago = now - timedelta(hours=24)
            
            recent_videos = []
            for item in items:
                pub_at_str = item["snippet"]["publishedAt"]
                # Format: 2023-10-25T15:30:00Z
                pub_at_dt = datetime.fromisoformat(pub_at_str.replace('Z', '+00:00'))
                if pub_at_dt >= one_day_ago:
                    recent_videos.append(item)

            if not recent_videos:
                return "No trending gaming videos found in the last 24 hours."

            # 3. Categorize into Videos and Shorts, and fetch channel stats
            videos = []
            shorts = []
            
            channel_ids = list(set([item["snippet"]["channelId"] for item in recent_videos]))
            
            # Batch fetch channel statistics
            channel_stats = {}
            if channel_ids:
                # Can only fetch 50 channels at a time
                for i in range(0, len(channel_ids), 50):
                     batch_ids = channel_ids[i:i+50]
                     ch_req = service.channels().list(
                         part="statistics",
                         id=",".join(batch_ids)
                     )
                     ch_res = await asyncio.to_thread(ch_req.execute)
                     for ch in ch_res.get("items", []):
                         channel_stats[ch["id"]] = int(ch["statistics"].get("subscriberCount", 0))

            for item in recent_videos:
                duration_iso = item["contentDetails"]["duration"]
                # A very rough approximation for shorts (<= 60 seconds).
                # ISO 8601 dur formats 'PT1M', 'PT59S'
                is_short = False
                title = item["snippet"]["title"].lower()
                
                if "m" not in duration_iso.lower() and "h" not in duration_iso.lower():
                    # No minutes or hours, only seconds e.g. PT59S
                    is_short = True
                elif "pt1m0s" in duration_iso.lower() or "pt1m" == duration_iso.lower():
                    is_short = True
                
                if "#shorts" in title:
                    is_short = True
                    
                ch_id = item["snippet"]["channelId"]
                sub_count = channel_stats.get(ch_id, float('inf'))
                
                vid_data = {
                    "title": item["snippet"]["title"],
                    "url": f"https://www.youtube.com/watch?v={item['id']}",
                    "views": int(item["statistics"].get("viewCount", 0)),
                    "likes": int(item["statistics"].get("likeCount", 0)),
                    "channel": item["snippet"]["channelTitle"],
                    "subs": sub_count
                }
                
                if is_short:
                    shorts.append(vid_data)
                else:
                    videos.append(vid_data)

            # Sort both by subscriber count ASCENDING (Prioritize smaller channels), then views DESCENDING
            videos.sort(key=lambda x: (x["subs"], -x["views"]))
            shorts.sort(key=lambda x: (x["subs"], -x["views"]))

            top_videos = videos[:3]
            top_shorts = shorts[:10]
            
            if not top_videos and not top_shorts:
                 return "No recent gaming videos or shorts found."

            # 4. Format Output
            msg = "🎮 **Top Trending Gaming (Last 24h)** 🎮\n\n"
            
            if top_videos:
                msg += "📺 **Top 3 Videos**\n"
                for i, v in enumerate(top_videos, 1):
                    msg += f"{i}. [{v['channel']}]({v['url']}) - {v['title']}\n"
                    # Format numbers nicely
                    subs_str = f"{v['subs']:,}" if v['subs'] != float('inf') else "Unknown"
                    msg += f"   👁️ {v['views']:,} | 👍 {v['likes']:,} | 👥 {subs_str} Subs\n\n"
                    
            if top_shorts:
                msg += "📱 **Top 10 Shorts**\n"
                for i, s in enumerate(top_shorts, 1):
                    msg += f"{i}. [{s['channel']}]({s['url']}) - {s['title']}\n"
                    subs_str = f"{s['subs']:,}" if s['subs'] != float('inf') else "Unknown"
                    msg += f"   👁️ {s['views']:,} | 👍 {s['likes']:,} | 👥 {subs_str} Subs\n"

            return msg
            
        except Exception as e:
            logger.error(f"YouTube Fetch Trending Error: {e}")
            return f"Error fetching YouTube trending: {str(e)}"

    async def search_videos(self, query: str, max_results: int = 3, video_duration: str = "any"):
        """Searches YouTube for videos matching the query."""
        creds = self._get_credentials()
        config = self.config_loader()
        
        service = None
        if creds:
             try:
                 service = await asyncio.to_thread(self._build_service_sync, creds=creds)
             except Exception as e:
                 logger.error(f"Failed to build YouTube service with OAuth: {e}")
        
        if not service:
            api_key = config.get("youtube", {}).get("api_key")
            if api_key:
                try:
                    service = await asyncio.to_thread(self._build_service_sync, api_key=api_key)
                except Exception as e:
                    logger.error(f"Failed to build YouTube service with API key: {e}")
                    return "Database Error: Could not authenticate with YouTube API."
            else:
                 logger.error("No YouTube API Key or OAuth credentials available for fetching trending.")
                 return "Configuration Error: No YouTube API Key or OAuth credentials available."

        try:
            request = service.search().list(
                q=query,
                part="snippet",
                type="video",
                videoDuration=video_duration,
                maxResults=max_results,
                order="relevance" # Default is relevance
            )
            response = await asyncio.to_thread(request.execute)
            
            items = response.get("items", [])
            if not items:
                return f"No results found for '{query}'."

            msg = f"🔍 **Search Results for '{query}'** 🔍\n\n"
            for i, item in enumerate(items, 1):
                title = item["snippet"]["title"]
                channel = item["snippet"]["channelTitle"]
                video_id = item["id"]["videoId"]
                url = f"https://www.youtube.com/watch?v={video_id}"
                msg += f"{i}. [{channel}]({url}) - {title}\n"
            
            return msg
            
        except Exception as e:
            logger.error(f"YouTube Search Error: {e}")
            return f"Error searching YouTube: {str(e)}"

    async def resolve_channel_id(self, username_or_handle: str):
        """Attempts to automatically resolve a YouTube channel ID from a username or handle."""
        creds = self._get_credentials()
        config = self.config_loader()
        
        service = None
        if creds:
             try:
                 service = await asyncio.to_thread(self._build_service_sync, creds=creds)
             except Exception:
                 pass
        
        if not service:
             api_key = config.get("youtube", {}).get("api_key")
             if api_key:
                 try:
                     service = await asyncio.to_thread(self._build_service_sync, api_key=api_key)
                 except Exception:
                     pass
                 
        if not service:
             return None
             
        try:
            # We use the search API because it reliably resolves both old usernames and new handles.
            # It costs 100 quota, so it should be used sparingly.
            request = service.search().list(
                part="snippet",
                q=username_or_handle,
                type="channel",
                maxResults=1
            )
            response = await asyncio.to_thread(request.execute)
            items = response.get("items", [])
            if items:
                return items[0]["snippet"]["channelId"]
                
            return None
        except Exception as e:
            logger.error(f"Error resolving channel ID for {username_or_handle}: {e}")
            return None

    async def duplicate_last_stream(self, scheduled_start_time_iso: str):
        """Schedules a new stream with the same snippet/status as the last stream."""
        creds = self._get_credentials()
        if not creds:
            return "Not authenticated with YouTube. Please log in via the dashboard."

        try:
            service = await asyncio.to_thread(self._build_service_sync, creds=creds)
            
            # Fetch the last broadcast
            request = service.liveBroadcasts().list(
                part="snippet,status,contentDetails",
                broadcastType="all",
                mine=True,
                maxResults=1
            )
            response = await asyncio.to_thread(request.execute)
            
            items = response.get("items", [])
            if not items:
                return "No previous broadcasts found to duplicate."
                
            last_stream = items[0]
            snippet = last_stream.get("snippet", {})
            status = last_stream.get("status", {})
            contentDetails = last_stream.get("contentDetails", {})
            
            title = snippet.get("title", "Scheduled Stream")
            description = snippet.get("description", "")
            privacyStatus = status.get("privacyStatus", "unlisted")
            
            # Prepare new snippet
            new_snippet = {
                "title": title,
                "description": description,
                "scheduledStartTime": scheduled_start_time_iso
            }
            
            new_status = {
                "privacyStatus": privacyStatus,
                "selfDeclaredMadeForKids": status.get("selfDeclaredMadeForKids", False)
            }
            
            new_contentDetails = {
                "enableAutoStart": contentDetails.get("enableAutoStart", True),
                "enableAutoStop": contentDetails.get("enableAutoStop", True),
                "enableClosedCaptions": contentDetails.get("enableClosedCaptions", False),
                "recordFromStart": contentDetails.get("recordFromStart", True),
            }
            
            insert_request = service.liveBroadcasts().insert(
                part="snippet,status,contentDetails",
                body={
                    "snippet": new_snippet,
                    "status": new_status,
                    "contentDetails": new_contentDetails
                }
            )
            insert_response = await asyncio.to_thread(insert_request.execute)
            
            broadcast_id = insert_response.get("id")
            url = f"https://studio.youtube.com/video/{broadcast_id}/livestreaming"
            
            return f"✅ Successfully scheduled a new stream for {scheduled_start_time_iso}!\nTitle: {title}\nStudio Link: {url}"
            
        except Exception as e:
            logger.error(f"YouTube Duplicate Stream Error: {e}")
            if "force-ssl" in str(e):
                 return "Missing permissions. Please re-authenticate YouTube in the dashboard."
            return f"YouTube API Error scheduling stream: {str(e)}"

    async def get_live_stream_context(self):
        """Fetches title and description of the current active live stream."""
        creds = self._get_credentials()
        if not creds:
            return None
        
        try:
            service = await asyncio.to_thread(self._build_service_sync, creds=creds)
            request = service.liveBroadcasts().list(
                part="snippet,liveStreamingDetails",
                broadcastStatus="active",
                broadcastType="all",
                mine=True
            )
            response = await asyncio.to_thread(request.execute)
            
            items = response.get("items", [])
            if not items:
                return None
                
            snippet = items[0].get("snippet", {})
            details = items[0].get("liveStreamingDetails", {})
            return {
                "id": items[0].get("id"),
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "actualStartTime": details.get("actualStartTime")
            }
        except Exception as e:
            logger.error(f"Live Stream Context Error: {e}")
            return None
