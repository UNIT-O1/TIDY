<div align="center">

# TIDY

### Self-Expiring, Recycle-Bin-Bound Browser Downloads

[![Manifest](https://img.shields.io/badge/extension-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](#repository-structure)
[![Platform](https://img.shields.io/badge/OS-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge)](#quick-start--installation)
[![Native Host](https://img.shields.io/badge/native%20host-Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](#architecture)
[![Recoverable](https://img.shields.io/badge/deletion-never%20permanent-brightgreen?style=for-the-badge)](#security--privacy-guarantees)

> **An Architecture for Self-Expiring, Recycle-Bin-Bound Browser Downloads**
> Built strictly to the TIDY Engineering Whitepaper specification.

</div>

<br>

<div align="center">

| [The Problem](#the-problem) | [Overview](#overview) | [Architecture](#architecture) | [Repository Structure](#repository-structure) | [Quick Start](#quick-start--installation) | [Testing](#testing--verification) | [Security](#security--privacy-guarantees) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|

</div>

<br>

## The Problem

Nearly every browser session leaves something behind. A bank statement you needed once. An email attachment. A software installer you ran and will never open again. A screenshot for a support ticket. A boarding pass PDF from a trip that's already over.

None of these are ever deliberately deleted, because deleting things is a chore nobody schedules. So they accumulate:

- **Downloads folders become landfill** — hundreds of files with no signal for what's still needed versus what was only ever needed once
- **"I'll clean it up later" never happens**, because there's no prompt, no reminder, and no cost to leaving it
- **Manual cleanup is risky** — bulk-deleting a cluttered folder means either being too cautious (nothing gets removed) or too aggressive (something important gets permanently deleted)
- **Permanent deletion is the wrong default** for this problem — the fear of losing something by mistake is exactly why cleanup gets postponed indefinitely

The result is a folder that grows forever and a cleanup task that never feels safe enough to actually do.

> [!TIP]
> ### What TIDY does about it
> TIDY lets you classify any download as **Temporary** or **Permanent** at the moment it lands, gives temporary files an expiry timestamp, and — when that timestamp passes — moves them to the OS Recycle Bin rather than deleting them outright. Cleanup becomes automatic, and it's never irreversible.

<br>

## Overview

**TIDY** solves this by letting you classify any download as **Temporary** or **Permanent** right at download time:

- **Temporary downloads** are segregated into `Downloads/Temporary/`.
- Every temporary file carries an **expiry timestamp** (default: 7 days, fully customizable).
- When a file expires, TIDY moves it to your **OS Recycle Bin / Trash** (never permanently deleted outright, ensuring everything is restorable with standard OS Undo).
- **Graceful degradation**: If the native helper is not installed, downloads are still safely organized in `Downloads/Temporary/`.

<br>

## Architecture

```
                                 ┌────────────────────────┐
                                 │   Browser (Chrome/Edge)│
                                 └───────────┬────────────┘
                                             │ download event
                                             ▼
                             ┌───────────────────────────────┐
                             │  TIDY Extension (MV3)     │
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
                                            │ TIDY Native Host (Py) │
                                            └───────────────┬───────────┘
                                                            │
                                      send2trash (OS Shell) │
                                                            ▼
                                            ┌───────────────────────────┐
                                            │   OS Recycle Bin / Trash  │
                                            └───────────────────────────┘
```

<br>

## Repository Structure

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

<br>

## Quick Start & Installation

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
5. The **TempDrop** icon will appear in your browser toolbar.

<br>

## Testing & Verification

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
2. The **TIDY Prompt** will pop up asking:
   - **Temporary** (with chosen retention window: 1, 3, 7, 14, 30 days)
   - **Permanent** (keeps file unmodified)
3. Choose **Temporary**. The file will download into `Downloads/Temporary/`.
4. Open the extension popup or options dashboard to see your file tracked with an active countdown badge.
5. Click **Trash Now** to immediately verify it lands in your real Windows Recycle Bin.

<br>

## Security & Privacy Guarantees

> [!IMPORTANT]
> - **Enforced Least Privilege** — The native host strictly rejects any command targeting files outside the user's `Downloads/Temporary/` directory.
> - **Recoverable by Design** — Uses OS Recycle Bin APIs (`SHFileOperationW` / `send2trash`) instead of permanent deletion (`rm -f`).
> - **Zero Network Activity** — The native host performs 0 outbound network requests.
> - **Sandboxed Origin Allowlisting** — Locked down to the extension origin.

<br>

---

<div align="center">

**TIDY** &middot; Cleanup that happens automatically, and is never irreversible.

</div>
