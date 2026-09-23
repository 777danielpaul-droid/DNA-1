@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo        PRIS - Dev Server starten
echo ========================================
echo.
echo Terminal-Bridge wird automatisch gestartet.
echo PRIS laeuft danach auf http://localhost:3000

echo.
npm run dev
pause
