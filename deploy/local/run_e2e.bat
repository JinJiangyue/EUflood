@echo off
chcp 65001 >nul
setlocal ENABLEDELAYEDEXPANSION

REM 项目根路径（本脚本位于 deploy\local 下）
set ROOT=%~dp0..\..
pushd "%ROOT%"

echo [1/6] 准备 apps\api 依赖与环境...
cd apps\api

if not exist node_modules (
  echo 安装依赖中...（首次耗时略长）
  call npm install || goto :fail
)

if not exist .env (
  echo 生成默认 .env ...
  > .env echo PORT=3000
  >> .env echo DB_FILE=./dev.db
  >> .env echo LOG_LEVEL=info
)

echo [2/6] 启动本地服务（新窗口）...
REM 在新窗口启动开发服务
start "EUflood API" cmd /c "npm run dev"

echo [3/6] 等待服务就绪...
set /a retries=60
:wait_loop
  curl -s http://localhost:3000/health >nul 2>nul
  if !errorlevel! EQU 0 (
    echo 服务已就绪
    echo 打开浏览器首页...
    start "" http://localhost:3000/
    goto :ready
  )
  set /a retries-=1
  if !retries! LEQ 0 goto :fail_wait
  timeout /t 1 >nul
  goto :wait_loop

:ready
echo [4/6] 采集示例数据（/ingestion/run）...
curl -s -X POST http://localhost:3000/ingestion/run -H "Content-Type: application/json" -d "{\"count\": 10}" || goto :fail
echo.

echo [5/6] 处理数据（/processing/run）...
curl -s -X POST http://localhost:3000/processing/run || goto :fail
echo.

echo [6/6] 分析与导出...
echo - 分析摘要（/analysis/summary）
curl -s http://localhost:3000/analysis/summary || goto :fail
echo.

REM 导出 CSV 到 deploy\local\export.csv
cd "%ROOT%"
if not exist deploy\local mkdir deploy\local >nul 2>nul
echo - 导出 CSV（/export → deploy\local\export.csv）
curl -s http://localhost:3000/export -o deploy\local\export.csv || goto :fail

echo.
echo 已完成：采集 → 处理 → 分析 → 导出
echo 导出文件：%ROOT%\deploy\local\export.csv
popd
exit /b 0

:fail_wait
echo 等待服务超时，请检查端口或窗口日志。
popd
exit /b 1

:fail
echo 执行失败，请查看上方错误信息。
popd
exit /b 1


