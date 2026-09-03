@echo off
rem TempDrop Native Messaging Host Windows Launcher
setlocal
set "SCRIPT_DIR=%~dp0"
python "%SCRIPT_DIR%native_host.py" %*
