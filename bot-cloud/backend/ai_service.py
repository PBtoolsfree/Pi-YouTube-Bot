import asyncio
import logging
import time
import httpx
from typing import Any, Dict, List, Optional

from .config_manager import ConfigManager

logger = logging.getLogger(__name__)


class AIEngine:
    """
    Multi-provider AI engine with automatic failover.

    Supported provider types: openai, custom, groq, gemini, ollama.
    Providers and models are configured in config.json under 'ai_topology'.
    """

    def __init__(self) -> None:
        # Shared HTTP client — reused across all AI calls to avoid
        # connection setup/teardown overhead on every request (important on Pi 4).
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy-init a shared httpx client."""
        client = self._http_client
        if client is None or getattr(client, "is_closed", True):
            self._http_client = httpx.AsyncClient(timeout=60.0)
            return self._http_client
        return client

    async def close(self) -> None:
        """Close the shared HTTP client (call on shutdown)."""
        client = self._http_client
        if client is not None and not getattr(client, "is_closed", True):
            await client.close()
        self._http_client = None

    # ── Public API ─────────────────────────────────────────────────────────────

    async def chat(
        self,
        messages_or_prompt: Any,
        system_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send a chat message through the provider chain with failover.

        Args:
            messages_or_prompt: A string prompt OR a list of {"role", "content"} dicts.
            system_prompt: Optional override for the system prompt.

        Returns:
            dict with keys: response, provider, model, latency, trace
            On total failure: response=None, error="All providers failed."
        """
        config = ConfigManager.get_config()
        topology = config.get("ai_topology", {})
        providers = topology.get("providers", [])

        effective_system_prompt = system_prompt or topology.get(
            "system_prompt", "You are a helpful assistant."
        )

        # Normalise input to a message list
        if isinstance(messages_or_prompt, str):
            conversation_history: List[Dict[str, str]] = [
                {"role": "user", "content": messages_or_prompt}
            ]
        else:
            conversation_history = list(messages_or_prompt)

        # Inject / overwrite system prompt
        if conversation_history and conversation_history[0].get("role") == "system":
            if system_prompt:
                conversation_history[0]["content"] = effective_system_prompt
        else:
            conversation_history.insert(
                0, {"role": "system", "content": effective_system_prompt}
            )

        # Build execution plan (enabled providers × enabled models, sorted by priority)
        plan: List[tuple] = []
        for prov in providers:
            if not prov.get("enabled", True):
                continue
            models = sorted(
                [m for m in prov.get("models", []) if m.get("enabled", True)],
                key=lambda m: m.get("priority", 999),
            )
            for mod in models:
                plan.append((prov, mod))

        trace: List[Dict[str, Any]] = []
        start_time = time.time()

        for provider, model in plan:
            prov_name = provider.get("name", provider.get("id", "unknown"))
            model_id = model.get("id", "unknown")
            step_start = time.time()

            try:
                prov_type = provider.get("type", "")
                if prov_type in {"openai", "custom", "groq", "gemini"}:
                    response_text = await self._call_openai_compatible(
                        provider, model_id, conversation_history
                    )
                elif prov_type == "ollama":
                    response_text = await self._call_ollama(
                        provider, model_id, conversation_history
                    )
                else:
                    raise ValueError(f"Unknown provider type: {prov_type!r}")

                latency = time.time() - step_start
                trace.append(
                    {
                        "provider": prov_name,
                        "model": model_id,
                        "status": "success",
                        "latency": float(f"{latency:.3f}"),
                        "timestamp": time.time(),
                    }
                )
                logger.info(
                    "AI response from %s/%s in %.2fs", prov_name, model_id, latency
                )
                return {
                    "response": response_text,
                    "provider": prov_name,
                    "model": model_id,
                    "latency": float(f"{latency:.3f}"),
                    "trace": trace,
                }

            except Exception as exc:
                latency = time.time() - step_start
                logger.warning(
                    "Provider %s/%s failed (%.2fs): %s",
                    prov_name,
                    model_id,
                    latency,
                    exc,
                )
                trace.append(
                    {
                        "provider": prov_name,
                        "model": model_id,
                        "status": "error",
                        "error": str(exc),
                        "latency": float(f"{latency:.3f}"),
                        "timestamp": time.time(),
                    }
                )

        total_time = time.time() - start_time
        logger.error(
            "All AI providers failed after %.2fs. Providers tried: %d",
            total_time,
            len(plan),
        )
        return {
            "response": None,
            "error": "All providers failed.",
            "trace": trace,
            "latency": float(f"{total_time:.3f}"),
        }

    async def test_connection(self, provider: Dict[str, Any]) -> Dict[str, Any]:
        """Test connectivity for a specific provider config dict."""
        models = [m for m in provider.get("models", []) if m.get("enabled", True)]
        if not models:
            return {
                "status": "error",
                "message": "No enabled models found for this provider.",
            }

        model_id = models[0].get("id", "")
        messages = [{"role": "user", "content": "Hello"}]

        try:
            prov_type = provider.get("type", "")
            if prov_type in {"openai", "custom", "groq", "gemini"}:
                await self._call_openai_compatible(provider, model_id, messages)
            elif prov_type == "ollama":
                await self._call_ollama(provider, model_id, messages)
            else:
                return {
                    "status": "error",
                    "message": f"Unknown provider type: {prov_type!r}",
                }
            return {
                "status": "success",
                "message": f"Connected successfully to {model_id}",
            }
        except Exception as exc:
            logger.warning("Provider test failed for %s: %s", model_id, exc)
            return {"status": "error", "message": str(exc)}

    # ── Private Helpers ────────────────────────────────────────────────────────

    async def _call_openai_compatible(
        self,
        provider: Dict[str, Any],
        model_id: str,
        messages: List[Dict[str, str]],
    ) -> str:
        api_key: str = provider.get("api_key", "")
        base_url: str = provider.get("base_url") or "https://api.openai.com/v1"
        url = f"{base_url.rstrip('/')}/chat/completions"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": model_id, "messages": messages}

        client = await self._get_client()
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    async def _call_ollama(
        self,
        provider: Dict[str, Any],
        model_id: str,
        messages: List[Dict[str, str]],
    ) -> str:
        base_url: str = provider.get("base_url") or "http://localhost:11434"
        url = f"{base_url.rstrip('/')}/api/chat"
        payload = {"model": model_id, "messages": messages, "stream": False}

        client = await self._get_client()
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()["message"]["content"]
