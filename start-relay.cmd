@echo off
pushd "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0relay\start-windows.ps1"
echo.
echo O encaminhador parou. Pressione uma tecla para fechar.
pause >nul
popd
