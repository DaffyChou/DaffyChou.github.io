@echo off
chcp 65001 >nul
cd /d D:\公司內部\DaffyChou.github.io
if exist .git\index.lock del .git\index.lock
git add pm/index.html
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value ^| find "="') do set dt=%%I
set TODAY=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%
git commit -m "chore(pm): daily PM snapshot %TODAY%"
git push
echo.
echo === 完成。GitHub Pages 約 1-2 分鐘後生效 ^-^> https://daffychou.github.io/pm/ ===
pause
