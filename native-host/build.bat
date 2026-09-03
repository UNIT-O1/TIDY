@echo off
setlocal enabledelayedexpansion
echo [TempDrop] Building Native Messaging Host executable...

python -m pip install -r requirements.txt
python -m PyInstaller --onefile --name tempdrop_host --noconsole native_host.py

if exist "dist\tempdrop_host.exe" (
    echo [TempDrop] Build succeeded! Output: dist\tempdrop_host.exe
) else (
    echo [TempDrop] Build failed. Please check errors above.
)
