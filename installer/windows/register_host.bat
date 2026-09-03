@echo off
setlocal
echo ====================================================
echo   Registering TempDrop Native Messaging Host
echo ====================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*

echo.
pause
