@echo off
REM ===== ЕОД Sync Launcher =====
REM Запуск: Task Scheduler -> щодня о 08:00
REM Або вручну: подвійний клік на цей файл

cd /d "%~dp0"
python eod-sync.py --mode ui >> eod-sync.log 2>&1

if %ERRORLEVEL% NEQ 0 (
    echo [%DATE% %TIME%] SYNC FAILED >> eod-sync.log
) else (
    echo [%DATE% %TIME%] SYNC OK >> eod-sync.log
)
