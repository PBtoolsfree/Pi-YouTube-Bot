import unittest
import os
import sys
import json
import shutil
import tempfile
from unittest.mock import patch

cloud_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bot-cloud'))
if cloud_dir not in sys.path:
    sys.path.insert(0, cloud_dir)

from fastapi.testclient import TestClient
from backend.api import app
from backend.services.custom_overlay_service import CustomOverlayService


class TestIssue2CustomOverlay(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.test_data_dir = tempfile.mkdtemp()
        self.overlays_file = os.path.join(self.test_data_dir, "custom_overlays.json")

    def tearDown(self):
        shutil.rmtree(self.test_data_dir, ignore_errors=True)

    def test_custom_overlay_service_crud_and_resolution_persistence(self):
        """Custom overlay service persists resolution and all widget layers including ticker."""
        with patch("backend.services.custom_overlay_service.DATA_FILE_DATA", self.overlays_file), \
             patch("backend.services.custom_overlay_service.DATA_FILE_ROOT", self.overlays_file + ".root"):
            # 1. Create overlay with ticker, boss, superchat, pokemon layers
            layers = [
                {
                    "id": "w_ticker_1",
                    "type": "ticker",
                    "title": "TOP SUPPORTERS",
                    "speed": 35,
                    "color": "#10b981",
                    "customText": "Welcome to the stream!",
                    "x": 0,
                    "y": 1020,
                    "width": 1920,
                    "height": 60,
                    "visible": True,
                    "zIndex": 10
                },
                {
                    "id": "w_boss_1",
                    "type": "boss",
                    "x": 50,
                    "y": 50,
                    "width": 400,
                    "height": 200,
                    "visible": True,
                    "zIndex": 5
                },
                {
                    "id": "w_sc_1",
                    "type": "superchat",
                    "x": 500,
                    "y": 50,
                    "width": 400,
                    "height": 300,
                    "visible": True,
                    "zIndex": 6
                },
                {
                    "id": "w_poke_1",
                    "type": "pokemon",
                    "x": 950,
                    "y": 50,
                    "width": 400,
                    "height": 400,
                    "visible": True,
                    "zIndex": 7
                }
            ]

            created = CustomOverlayService.create(
                name="Stream 1080p Main Overlay",
                widgets=layers,
                resolution={"width": 1920, "height": 1080}
            )

            self.assertIsNotNone(created.get("id"))
            self.assertEqual(created.get("name"), "Stream 1080p Main Overlay")
            self.assertEqual(len(created.get("widgets", [])), 4)
            self.assertEqual(created.get("resolution"), {"width": 1920, "height": 1080})

            overlay_id = created["id"]

            # 2. Retrieve overlay by id
            fetched = CustomOverlayService.get_by_id(overlay_id)
            self.assertIsNotNone(fetched)
            self.assertEqual(fetched.get("resolution"), {"width": 1920, "height": 1080})
            
            ticker_widget = next((w for w in fetched["widgets"] if w["type"] == "ticker"), None)
            self.assertIsNotNone(ticker_widget)
            self.assertEqual(ticker_widget["width"], 1920)
            self.assertEqual(ticker_widget["height"], 60)
            self.assertEqual(ticker_widget["speed"], 35)
            self.assertEqual(ticker_widget["color"], "#10b981")
            self.assertEqual(ticker_widget["customText"], "Welcome to the stream!")

            # 3. Update overlay with modified resolution and ticker position
            ticker_widget["x"] = 0
            ticker_widget["y"] = 0
            ticker_widget["title"] = "LIVE BREAKING NEWS"
            updated = CustomOverlayService.update(
                overlay_id=overlay_id,
                payload={
                    "name": "Stream 1080p Main Overlay Updated",
                    "widgets": fetched["widgets"],
                    "resolution": {"width": 1920, "height": 1080}
                }
            )

            self.assertIsNotNone(updated)
            self.assertEqual(updated["name"], "Stream 1080p Main Overlay Updated")
            self.assertEqual(updated["resolution"], {"width": 1920, "height": 1080})
            updated_ticker = next((w for w in updated["widgets"] if w["type"] == "ticker"), None)
            self.assertEqual(updated_ticker["title"], "LIVE BREAKING NEWS")
            self.assertEqual(updated_ticker["y"], 0)

    def test_custom_overlay_api_endpoints(self):
        """API endpoints /api/custom-overlays persist resolution and layers."""
        with patch("backend.services.custom_overlay_service.DATA_FILE_DATA", self.overlays_file), \
             patch("backend.services.custom_overlay_service.DATA_FILE_ROOT", self.overlays_file + ".root"):
            # POST /api/custom-overlays
            payload = {
                "name": "Live OBS Overlay",
                "resolution": {"width": 1920, "height": 1080},
                "widgets": [
                    {
                        "id": "ticker_layer",
                        "type": "ticker",
                        "x": 0,
                        "y": 1020,
                        "width": 1920,
                        "height": 60,
                        "visible": True
                    }
                ]
            }
            res_post = self.client.post("/api/custom-overlays", json=payload)
            self.assertEqual(res_post.status_code, 200)
            data_post = res_post.json()
            overlay_id = data_post["id"]
            self.assertEqual(data_post["resolution"], {"width": 1920, "height": 1080})

            # GET /api/custom-overlays/{id}
            res_get = self.client.get(f"/api/custom-overlays/{overlay_id}")
            self.assertEqual(res_get.status_code, 200)
            data_get = res_get.json()
            self.assertEqual(data_get["id"], overlay_id)
            self.assertEqual(data_get["resolution"], {"width": 1920, "height": 1080})
            self.assertEqual(data_get["widgets"][0]["type"], "ticker")

            # PUT /api/custom-overlays/{id}
            update_payload = {
                "name": "Live OBS Overlay Renamed",
                "resolution": {"width": 1920, "height": 1080},
                "widgets": data_get["widgets"]
            }
            res_put = self.client.put(f"/api/custom-overlays/{overlay_id}", json=update_payload)
            self.assertEqual(res_put.status_code, 200)
            data_put = res_put.json()
            self.assertEqual(data_put["name"], "Live OBS Overlay Renamed")
            self.assertEqual(data_put["resolution"], {"width": 1920, "height": 1080})


if __name__ == "__main__":
    unittest.main()
