@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 24 LTS, then run this file again.
  pause
  exit /b 1
)
node scripts\start.mjs
if errorlevel 1 pause
endlocal
