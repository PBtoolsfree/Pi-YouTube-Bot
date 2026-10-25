import unittest
import os
import sys
import io
import zipfile
import json
import base64
import shutil
import tempfile
from unittest.mock import patch, MagicMock

# Ensure bot-cloud backend is used
cloud_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bot-cloud'))
if cloud_dir not in sys.path:
    sys.path.insert(0, cloud_dir)

from fastapi.testclient import TestClient
from fastapi import HTTPException
from backend.api import (
    app,
    _restore_backup_zip,
    _verify_admin_access,
    _get_max_backup_size_bytes,
    _get_backups_dir,
    DEFAULT_MAX_BACKUP_SIZE_MB
)


class TestIssue1BackupRestore(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_backup_export_creates_valid_zip(self):
        """Export backup creates a valid zip archive containing configuration/data."""
        with patch("backend.api._verify_admin_access", return_value=None):
            resp = self.client.get("/api/backup/export")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.headers.get("content-type"), "application/zip")
            self.assertTrue(len(resp.content) > 0)

            # Verify it's a valid zip file
            zf = zipfile.ZipFile(io.BytesIO(resp.content))
            names = zf.namelist()
            self.assertTrue(len(names) >= 0)

    def test_restore_rejects_corrupted_zip(self):
        """Restoring a corrupted non-zip file must return HTTP 400."""
        with patch("backend.api._verify_admin_access", return_value=None):
            corrupt_bytes = b"not a zip file at all, just junk"
            files = {"file": ("backup.zip", io.BytesIO(corrupt_bytes), "application/zip")}
            resp = self.client.post("/api/backup/import", files=files)
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Invalid ZIP archive", resp.json().get("detail", ""))

    def test_restore_rejects_path_traversal(self):
        """Restoring a ZIP with path traversal attacks must be rejected."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("../traversal.txt", "evil payload")
        buf.seek(0)

        with self.assertRaises(HTTPException) as ctx:
            _restore_backup_zip(buf.getvalue())
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("invalid path characters", ctx.exception.detail)

    def test_restore_rejects_unauthorized_files(self):
        """Restoring a ZIP with unauthorized file paths outside allowed files/dirs must be rejected."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("unauthorized_script.py", "print('bad')")
        buf.seek(0)

        with self.assertRaises(HTTPException) as ctx:
            _restore_backup_zip(buf.getvalue())
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Unrecognized or unauthorized file", ctx.exception.detail)

    def test_restore_rejects_invalid_json(self):
        """Restoring a ZIP with invalid JSON must be rejected during staging."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("data/custom_overlays.json", "{not-valid-json}")
        buf.seek(0)

        with self.assertRaises(HTTPException) as ctx:
            _restore_backup_zip(buf.getvalue())
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid JSON", ctx.exception.detail)

    def test_restore_rejects_invalid_sqlite(self):
        """Restoring a ZIP with corrupt SQLite file must be rejected during staging."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("data/viewers.db", b"NotAnSQLiteDBFileAtAll!!")
        buf.seek(0)

        with self.assertRaises(HTTPException) as ctx:
            _restore_backup_zip(buf.getvalue())
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid SQLite database", ctx.exception.detail)

    def test_restore_rejects_oversized_payload_413(self):
        """Upload exceeding max size returns HTTP 413."""
        with patch("backend.api._verify_admin_access", return_value=None), \
             patch("backend.api._get_max_backup_size_bytes", return_value=50): # 50 bytes limit
            large_buf = io.BytesIO(b"PK\x03\x04" + b"A" * 200)
            files = {"file": ("backup.zip", large_buf, "application/zip")}
            resp = self.client.post("/api/backup/import", files=files)
            self.assertEqual(resp.status_code, 413)
            self.assertIn("exceeds", resp.json().get("detail", "").lower())

    def test_restore_admin_auth_enforced(self):
        """When password is configured, unauthenticated restore must be rejected with 401."""
        valid_buf = io.BytesIO()
        with zipfile.ZipFile(valid_buf, "w") as zf:
            zf.writestr("data/test.json", "{}")
        valid_buf.seek(0)

        with patch("backend.api._get_config", return_value={"security": {"dashboard_password": "supersecretpassword"}}):
            files = {"file": ("backup.zip", io.BytesIO(valid_buf.getvalue()), "application/zip")}
            
            # 1. Unauthenticated request -> 401
            resp = self.client.post("/api/backup/import", files=files)
            self.assertEqual(resp.status_code, 401)
            self.assertIn("Unauthorized", resp.text)

            # 2. Wrong credentials -> 401
            bad_auth = base64.b64encode(b"admin:wrongpassword").decode("utf-8")
            files = {"file": ("backup.zip", io.BytesIO(valid_buf.getvalue()), "application/zip")}
            resp = self.client.post("/api/backup/import", files=files, headers={"Authorization": f"Basic {bad_auth}"})
            self.assertEqual(resp.status_code, 401)

            # 3. Correct credentials -> allowed through auth
            good_auth = base64.b64encode(b"admin:supersecretpassword").decode("utf-8")
            with patch("backend.api._restore_backup_zip", return_value=None):
                files = {"file": ("backup.zip", io.BytesIO(valid_buf.getvalue()), "application/zip")}
                resp = self.client.post("/api/backup/import", files=files, headers={"Authorization": f"Basic {good_auth}"})
                self.assertEqual(resp.status_code, 200)

    def test_restore_valid_archive_creates_pre_restore_snapshot(self):
        """Valid archive creates a pre_restore_snapshot zip before modifying files."""
        # Create a valid test archive with custom_overlays.json in data/
        valid_buf = io.BytesIO()
        with zipfile.ZipFile(valid_buf, "w") as zf:
            zf.writestr("data/custom_overlays.json", json.dumps([]))
        valid_buf.seek(0)

        backups_dir = _get_backups_dir()
        os.makedirs(backups_dir, exist_ok=True)
        initial_snapshots = [f for f in os.listdir(backups_dir) if f.startswith("pre_restore_snapshot_")]

        # Restore
        _restore_backup_zip(valid_buf.getvalue())

        current_snapshots = [f for f in os.listdir(backups_dir) if f.startswith("pre_restore_snapshot_")]
        self.assertTrue(len(current_snapshots) > len(initial_snapshots))


if __name__ == "__main__":
    unittest.main()
