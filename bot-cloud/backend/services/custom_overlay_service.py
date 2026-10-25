import json
import os
import uuid
import logging

logger = logging.getLogger(__name__)

# Construct path relative to this file
_SERVICES_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_SERVICES_DIR)
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)

DATA_FILE_DATA = os.path.join(_PROJECT_ROOT, "data", "custom_overlays.json")
DATA_FILE_ROOT = os.path.join(_PROJECT_ROOT, "custom_overlays.json")
DATA_FILE_BACKEND_DATA = os.path.join(_BACKEND_DIR, "data", "custom_overlays.json")

def _get_read_path():
    if os.path.exists(DATA_FILE_DATA):
        return DATA_FILE_DATA
    if os.path.exists(DATA_FILE_ROOT):
        return DATA_FILE_ROOT
    if os.path.exists(DATA_FILE_BACKEND_DATA):
        return DATA_FILE_BACKEND_DATA
    return DATA_FILE_DATA

class CustomOverlayService:
    @staticmethod
    def _load_data():
        path = _get_read_path()
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading custom overlays from {path}: {e}")
            return []

    @staticmethod
    def _save_data(data):
        try:
            # Ensure directory exists and write to data/custom_overlays.json
            os.makedirs(os.path.dirname(DATA_FILE_DATA), exist_ok=True)
            with open(DATA_FILE_DATA, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            # Also mirror to root custom_overlays.json for backup compatibility
            try:
                with open(DATA_FILE_ROOT, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=4)
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Error saving custom overlays: {e}")
            raise e

    @staticmethod
    def get_all():
        return CustomOverlayService._load_data()

    @staticmethod
    def get_by_id(overlay_id: str):
        data = CustomOverlayService._load_data()
        for item in data:
            if item.get("id") == overlay_id:
                return item
        return None

    @staticmethod
    def create(name: str, resolution: dict = None, widgets: list = None):
        data = CustomOverlayService._load_data()
        new_overlay = {
            "id": str(uuid.uuid4()),
            "name": name,
            "resolution": resolution or {"label": "Standard 1080p (1920x1080)", "w": 1920, "h": 1080},
            "widgets": widgets or []
        }
        data.append(new_overlay)
        CustomOverlayService._save_data(data)
        return new_overlay

    @staticmethod
    def update(overlay_id: str, payload: dict):
        data = CustomOverlayService._load_data()
        for i, item in enumerate(data):
            if item.get("id") == overlay_id:
                # Merge logic
                if "name" in payload:
                    item["name"] = payload["name"]
                if "widgets" in payload:
                    item["widgets"] = payload["widgets"]
                if "resolution" in payload:
                    item["resolution"] = payload["resolution"]
                
                data[i] = item
                CustomOverlayService._save_data(data)
                return item
        return None

    @staticmethod
    def delete(overlay_id: str):
        data = CustomOverlayService._load_data()
        new_data = [item for item in data if item.get("id") != overlay_id]
        
        if len(data) == len(new_data):
            return False
            
        CustomOverlayService._save_data(new_data)
        return True
