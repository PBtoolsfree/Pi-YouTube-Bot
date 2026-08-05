import json
import os
import uuid
import logging

logger = logging.getLogger(__name__)

# Construct path relative to this file: ../data/custom_overlays.json
DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "custom_overlays.json")

class CustomOverlayService:
    @staticmethod
    def _load_data():
        if not os.path.exists(DATA_FILE):
            return []
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading custom overlays: {e}")
            return []

    @staticmethod
    def _save_data(data):
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
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
    def create(name: str):
        data = CustomOverlayService._load_data()
        new_overlay = {
            "id": str(uuid.uuid4()),
            "name": name,
            "widgets": []
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
