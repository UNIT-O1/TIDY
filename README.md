# TempDrop — Self-Expiring Ephemeral Downloads

> **An Architecture for Self-Expiring, Recycle-Bin-Bound Browser Downloads**  
> Built strictly to the TempDrop Engineering Whitepaper specification.

---

## 🌟 Overview

Modern web browsing generates dozens of temporary files: email attachments, one-off PDFs, software installers, receipts, and temporary screenshots. These clutter your Downloads folder indefinitely.

**TempDrop** solves this by letting you classify any download as **Temporary** or **Permanent** right at download time:
- **Temporary downloads** are segregated into `Downloads/Temporary/`.
- Every temporary file carries an **expiry timestamp** (default: 7 days, fully customizable).
- When a file expires, TempDrop moves it to your **OS Recycle Bin / Trash** (never permanently deleted outright, ensuring everything is restorable with standard OS Undo).
- **Graceful degradation**: If the native helper is not installed, downloads are still safely organized in `Downloads/Temporary/`.

---

## 🏗️ Architecture

```
                                 ┌────────────────────────┐
                                 │   Browser (Chrome/Edge)│
                                 └───────────┬────────────┘
                                             │ download event
                                             ▼
                             ┌───────────────────────────────┐
                             │  TempDrop Extension (MV3)     │
                             │  • Prompt Interceptor         │
                             │  • Rules Classifier           │
                             │  • chrome.alarms Hourly Sweep │
                             └──────┬───────────────┬────────┘
                                    │               │
                        writes file │               │ save metadata
                                    ▼               ▼
        ┌───────────────────────────────┐   ┌───────────────────────────┐
        │  Downloads/Temporary/ Staging │   │    chrome.storage.local   │
        └───────────────────────────────┘   └───────────────┬───────────┘
                                                            │
                                         expired? trash cmd │ (Native Messaging)
                                                            ▼
                                            ┌───────────────────────────┐
                                            │ TempDrop Native Host (Py) │
                                            └───────────────┬───────────┘
                                                            │
                                      send2trash (OS Shell) │
                                                            ▼
                                            ┌───────────────────────────┐
                                            │   OS Recycle Bin / Trash  │
                                            └───────────────────────────┘
```

---

## 📁 Repository Structure

```
tempdrop/
├── extension/                       # Manifest V3 Chrome/Edge Extension
│   ├── manifest.json                # MV3 manifest with permissions & icons
│   ├── background.js               # Service worker: download interception & alarm sweep
│   ├── prompt.html / .js / .css    # Download popup prompt (Temporary vs Permanent)
│   ├── popup.html / .js / .css     # Toolbar dashboard: active files, metrics, quick actions
│   ├── options.html / .js / .css   # Full dashboard: files table, rules editor, preferences
│   ├── lib/
│   │   ├── storage.js              # chrome.storage.local manager
│   │   ├── native.js               # Native messaging client wrapper
│   │   └── rules.js                # Auto-routing rules evaluator
│   └── icons/                      # High resolution PNG & SVG icons
├── native-host/                     # Privileged OS Recycle Bin Helper
│   ├── native_host.py              # Python host with length-prefixed stdin/stdout framing
│   ├── tempdrop_host.bat           # Direct Windows launcher for Python
│   ├── requirements.txt            # Dependencies: send2trash, pyinstaller
│   ├── build.bat                   # PyInstaller standalone executable compilation script
│   └── manifest/
│       └── com.tempdrop.host.json  # Native messaging manifest template
├── installer/                       # Native Host Registrars
│   ├── windows/
│   │   ├── install.ps1             # PowerShell registry installer for Chrome, Edge, Brave
│   │   ├── uninstall.ps1           # PowerShell registry uninstaller
│   │   └── register_host.bat       # 1-Click double-clickable Windows installer
│   ├── macos/
│   │   ├── install.sh              # macOS manifest drop-in installer
│   │   └── uninstall.sh
│   └── linux/
│       ├── install.sh              # Linux freedesktop manifest installer
│       └── uninstall.sh
├── tests/
│   ├── test_native_host.py         # Unit & integration tests for framing & trashing
│   └── test_rules.js               # Unit tests for rules engine matching logic
└── README.md
```

---

## 🚀 Quick Start & Installation

### Step 1: Register Native Messaging Host (Windows)

To allow the extension to send files to the Windows Recycle Bin, register the native host with one command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "tempdrop/installer/windows/install.ps1"
```
*(Or double-click `tempdrop/installer/windows/register_host.bat`)*

### Step 2: Load Extension in Chrome / Edge / Brave

1. Open your browser and navigate to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer Mode** (toggle in top right).
3. Click **Load unpacked**.
4. Select the `tempdrop/extension` folder.
5. The **TempDrop** icon will appear in your browser toolbar!

---

## 🧪 Testing & Verification

### 1. Run Native Host Test Suite

Run the Python unit & integration tests:
```powershell
python tempdrop/tests/test_native_host.py
```

### 2. Run Rules Engine Test Suite

Run the rules engine test script:
```powershell
node tempdrop/tests/test_rules.js
```

### 3. End-to-End Browser Test

1. Trigger a download (e.g. download any PDF or image).
2. The sleek **TempDrop Prompt** will pop up asking:
   - **Temporary** (with chosen retention window: 1, 3, 7, 14, 30 days)
   - **Permanent** (keeps file unmodified)
3. Choose **Temporary**. The file will download into `Downloads/Temporary/`.
4. Open the extension popup or options dashboard to see your file tracked with an active countdown badge.
5. Click **Trash Now** to immediately verify it lands in your real Windows Recycle Bin!

---

## 🔒 Security & Privacy Guarantees

- **Enforced Least Privilege**: The native host strictly rejects any command targeting files outside the user's `Downloads/Temporary/` directory.
- **Recoverable by Design**: Uses OS Recycle Bin APIs (`SHFileOperationW` / `send2trash`) instead of permanent deletion (`rm -f`).
- **Zero Network Activity**: The native host performs 0 outbound network requests.
- **Sandboxed Origin Allowlisting**: Locked down to the extension origin.
