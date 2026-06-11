@echo off
echo ================================
echo  ZenSkill Navigator - Share Mode
echo ================================
echo.
echo Getting ngrok tunnel URLs...
echo.

REM Get ngrok tunnels from API
for /f "tokens=*" %%i in ('powershell -Command "$response = Invoke-WebRequest -Uri 'http://127.0.0.1:4040/api/tunnels' -UseBasicParsing; $json = $response.Content | ConvertFrom-Json; $frontend = $json.tunnels | where {$_.name -eq 'frontend'} | select -ExpandProperty 'public_url'; $backend = $json.tunnels | where {$_.name -eq 'backend'} | select -ExpandProperty 'public_url'; Write-Host \"FRONTEND:$frontend`nBACKEND:$backend\""') do (
  echo %%i
)

echo.
echo ================================
echo  SHARING INSTRUCTIONS
echo ================================
echo.
echo 1. Copy the FRONTEND URL above
echo 2. Share it with testers
echo 3. They can access from anywhere
echo.
echo 4. Backend URL is used internally
echo    (no need to share)
echo.
echo Press any key to continue...
pause > nul
