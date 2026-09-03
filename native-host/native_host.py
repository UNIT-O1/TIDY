#!/usr/bin/env python3
"""
TempDrop Native Messaging Host
Handles privileged OS-level "move to Recycle Bin / Trash" operations on behalf of the TempDrop browser extension.
Communicates via standard Chrome/Firefox length-prefixed JSON protocol over stdin/stdout.
"""

import os
import sys
import json
import struct
import traceback
from pathlib import Path

# Send2Trash handles platform-specific trash:
# - Windows: SHFileOperationW with FOF_ALLOWUNDO / IFileOperation
# - macOS: NSFileManager.trashItem(at:resultingItemURL:) / osascript
# - Linux: Freedesktop.org XDG Trash Spec
try:
    from send2trash import send2trash
except ImportError:
    send2trash = None

VERSION = "1.0.0"

def get_downloads_dir() -> Path:
    """Returns the user's standard Downloads directory across platforms."""
    home = Path.home()
    if sys.platform == "win32":
        try:
            import winreg
            sub_key = r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, sub_key) as key:
                raw_path, _ = winreg.QueryValueEx(key, "{374DE290-123F-4565-9164-39C4925E467B}")
                expanded = os.path.expandvars(raw_path)
                return Path(expanded).resolve()
        except Exception:
            pass
    return (home / "Downloads").resolve()

def is_safe_staging_path(target_path_str: str) -> bool:
    """
    Security invariant: Enforce least privilege.
    Only permit trashing files that reside inside a Temporary subfolder within Downloads.
    Prevents any compromised extension from deleting arbitrary user files.
    """
    try:
        if not target_path_str or not target_path_str.strip():
            return False
        
        target = Path(target_path_str).resolve()
        if str(target) in ("/", "\\"):
            return False

        downloads_dir = get_downloads_dir()
        temp_staging_dir = (downloads_dir / "Temporary").resolve()
        
        # Staging directory itself must never be trashed
        if target == temp_staging_dir:
            return False

        # Must be a child of temp_staging_dir
        try:
            rel = target.relative_to(temp_staging_dir)
            if str(rel) == ".":
                return False
            return True
        except ValueError:
            pass

        # Fallback check for paths containing Temporary subfolder in Downloads
        normalized = str(target).replace("\\", "/").lower()
        if "/downloads/temporary/" in normalized:
            if normalized.endswith("/downloads/temporary") or normalized.endswith("/downloads/temporary/"):
                return False
            return True

        return False
    except Exception:
        return False

def read_message():
    """Reads a length-prefixed JSON message from sys.stdin."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack("<I", raw_length)[0]
    data = sys.stdin.buffer.read(length)
    if len(data) < length:
        return None
    return json.loads(data.decode("utf-8"))

def send_message(obj):
    """Sends a length-prefixed JSON message to sys.stdout."""
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()

def handle_message(msg):
    """Dispatches and handles extension messages."""
    if not isinstance(msg, dict):
        return {"ok": False, "error": "invalid_message_format"}

    action = msg.get("action")

    # 1. Health check ping
    if action == "ping":
        return {
            "ok": True,
            "pong": True,
            "version": VERSION,
            "platform": sys.platform,
            "has_send2trash": send2trash is not None,
            "downloads_dir": str(get_downloads_dir()),
            "staging_dir": str(get_downloads_dir() / "Temporary")
        }

    # 2. Move file to OS Recycle Bin / Trash
    elif action == "trash":
        path = msg.get("path")
        if not path or not isinstance(path, str):
            return {"ok": False, "error": "missing_path"}

        # Security check: must reside within Downloads/Temporary
        if not is_safe_staging_path(path):
            return {
                "ok": False,
                "error": "security_violation_path_not_in_temporary_staging",
                "path": path
            }

        if not os.path.exists(path):
            return {"ok": False, "error": "not_found", "path": path}

        if send2trash is None:
            return {"ok": False, "error": "send2trash_not_installed", "path": path}

        try:
            send2trash(path)
            return {"ok": True, "path": path}
        except Exception as e:
            return {"ok": False, "error": str(e), "path": path}

    # Unknown action
    return {"ok": False, "error": f"unknown_action: {action}"}

def main():
    if sys.platform == "win32":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

    while True:
        try:
            msg = read_message()
            if msg is None:
                break
            response = handle_message(msg)
            send_message(response)
        except (KeyboardInterrupt, SystemExit):
            break
        except Exception as err:
            err_response = {
                "ok": False,
                "error": "internal_error",
                "detail": str(err),
                "traceback": traceback.format_exc()
            }
            try:
                send_message(err_response)
            except Exception:
                break

if __name__ == "__main__":
    main()
