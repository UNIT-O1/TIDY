#!/usr/bin/env python3
"""
Unit and Integration Tests for TempDrop Native Host
Validates length-prefixed framing, ping health checks, security sandbox enforcement, and trash functionality.
"""

import sys
import os
import json
import struct
import tempfile
import unittest
from pathlib import Path

# Add native-host directory to sys.path
SCRIPT_DIR = Path(__file__).parent.resolve()
NATIVE_HOST_DIR = (SCRIPT_DIR.parent / "native-host").resolve()
sys.path.insert(0, str(NATIVE_HOST_DIR))

import native_host

class TestNativeHost(unittest.TestCase):

    def test_ping_action(self):
        """Test health check ping."""
        req = {"action": "ping"}
        res = native_host.handle_message(req)
        self.assertTrue(res.get("ok"))
        self.assertTrue(res.get("pong"))
        self.assertEqual(res.get("version"), "1.0.0")
        self.assertIn("downloads_dir", res)
        self.assertIn("staging_dir", res)
        print("  [PASS] Ping action")

    def test_unknown_action(self):
        """Test invalid/unknown action error response."""
        req = {"action": "delete_all_files"}
        res = native_host.handle_message(req)
        self.assertFalse(res.get("ok"))
        self.assertIn("unknown_action", res.get("error", ""))
        print("  [PASS] Unknown action rejection")

    def test_security_sandbox_boundary(self):
        """Test that paths outside Downloads/Temporary are strictly rejected."""
        downloads_dir = native_host.get_downloads_dir()
        staging_dir = downloads_dir / "Temporary"
        
        # Safe staging file
        safe_file = str(staging_dir / "invoice_test.pdf")
        self.assertTrue(native_host.is_safe_staging_path(safe_file))

        # Dangerous / out-of-bounds paths
        system_file = r"C:\Windows\System32\calc.exe" if sys.platform == "win32" else "/bin/ls"
        self.assertFalse(native_host.is_safe_staging_path(system_file))

        root_file = r"C:\secret.txt" if sys.platform == "win32" else "/secret.txt"
        self.assertFalse(native_host.is_safe_staging_path(root_file))

        downloads_root_file = str(downloads_dir / "keep_forever.pdf") # In Downloads but NOT in Temporary subfolder
        self.assertFalse(native_host.is_safe_staging_path(downloads_root_file))

        # The Temporary folder itself should not be trashable, only items inside it
        self.assertFalse(native_host.is_safe_staging_path(str(staging_dir)))
        print("  [PASS] Security sandbox boundary enforcement")

    def test_security_rejection_in_handle_message(self):
        """Verify handle_message returns security error when given forbidden path."""
        req = {"action": "trash", "path": r"C:\Windows\explorer.exe" if sys.platform == "win32" else "/etc/passwd"}
        res = native_host.handle_message(req)
        self.assertFalse(res.get("ok"))
        self.assertIn("security_violation", res.get("error", ""))
        print("  [PASS] Security rejection in handle_message")

    def test_trash_nonexistent_file(self):
        """Verify proper error when target file does not exist."""
        downloads_dir = native_host.get_downloads_dir()
        fake_path = str(downloads_dir / "Temporary" / "nonexistent_file_99999.pdf")
        req = {"action": "trash", "path": fake_path}
        res = native_host.handle_message(req)
        self.assertFalse(res.get("ok"))
        self.assertEqual(res.get("error"), "not_found")
        print("  [PASS] Non-existent file error handling")

    def test_real_trash_in_staging(self):
        """Create a real temporary test file in Downloads/Temporary and trash it."""
        downloads_dir = native_host.get_downloads_dir()
        staging_dir = downloads_dir / "Temporary"
        staging_dir.mkdir(parents=True, exist_ok=True)
        
        test_file = staging_dir / "tempdrop_test_file_to_trash.tmp"
        test_file.write_text("This is a TempDrop test file that will be moved to Recycle Bin.", encoding="utf-8")
        self.assertTrue(test_file.exists())

        req = {"action": "trash", "path": str(test_file)}
        res = native_host.handle_message(req)
        self.assertTrue(res.get("ok"), f"Failed to trash file: {res}")
        self.assertFalse(test_file.exists(), "File should no longer exist at original path after trashing")
        print("  [PASS] Real file trashing to Recycle Bin / Trash")

    def test_message_framing(self):
        """Test 32-bit unsigned little-endian JSON serialization framing."""
        msg = {"action": "ping", "test": True}
        encoded = json.dumps(msg).encode("utf-8")
        header = struct.pack("<I", len(encoded))
        
        # Verify unpack
        unpacked_len = struct.unpack("<I", header)[0]
        self.assertEqual(unpacked_len, len(encoded))
        decoded_obj = json.loads(encoded.decode("utf-8"))
        self.assertEqual(decoded_obj["action"], "ping")
        print("  [PASS] Message framing serialization")

if __name__ == "__main__":
    print("\n--- Running TempDrop Native Host Tests ---")
    unittest.main()
