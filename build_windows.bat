@echo off
REM Local Windows build. Needs: Visual Studio 2022 (Desktop development with C++), CMake and Git.
REM Python 3 is required for source generation and HTTP tests.
setlocal
cd /d "%~dp0"

if not exist ffgl-sdk (
    git clone https://github.com/resolume/ffgl.git ffgl-sdk || goto :fail
    git -C ffgl-sdk checkout 5b6e07840277df9ec35a228b9eb067636316350f || goto :fail
)

where python >nul 2>nul || goto :fail
python tools\gen_shader.py || goto :fail
python tools\embed_panel.py || goto :fail

cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DFFGL_ROOT="%CD%\ffgl-sdk" || goto :fail
cmake --build build --config Release --parallel || goto :fail
ctest --test-dir build -C Release --output-on-failure || goto :fail

set DEST=%USERPROFILE%\Documents\Resolume Arena\Extra Effects
if not exist "%DEST%" mkdir "%DEST%"
copy /y build\Release\BackgroundGen.dll "%DEST%\" || goto :fail

echo.
echo Done: %DEST%\BackgroundGen.dll
echo Restart Resolume and look for "Background Gen" under Sources ^> FFGL.
exit /b 0

:fail
echo.
echo BUILD FAILED
exit /b 1
