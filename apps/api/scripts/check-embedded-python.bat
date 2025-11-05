@echo off
chcp 65001 >nul
echo ========================================
echo 检查嵌入式Python环境
echo ========================================
echo.

set PYTHON_EMBED_DIR=%~dp0..\python-embed

echo [检查1] 嵌入式Python目录...
if exist "%PYTHON_EMBED_DIR%" (
    echo ✅ 目录存在：%PYTHON_EMBED_DIR%
) else (
    echo ❌ 目录不存在：%PYTHON_EMBED_DIR%
    echo 请运行 setup-embedded-python.bat 安装
    pause
    exit /b 1
)
echo.

echo [检查2] Python可执行文件...
if exist "%PYTHON_EMBED_DIR%\python.exe" (
    echo ✅ python.exe存在
    "%PYTHON_EMBED_DIR%\python.exe" --version
) else (
    echo ❌ python.exe不存在
    pause
    exit /b 1
)
echo.

echo [检查3] pip...
set PIP_EXE=%PYTHON_EMBED_DIR%\Scripts\pip.exe
if exist "%PIP_EXE%" (
    echo ✅ pip存在
    "%PIP_EXE%" --version
) else (
    echo ❌ pip不存在
    echo 请运行 install-python-deps.bat 安装pip
)
echo.

echo [检查4] 已安装的包...
if exist "%PIP_EXE%" (
    "%PIP_EXE%" list
) else (
    echo 无法检查（pip未安装）
)
echo.

echo [检查5] 关键依赖包...
if exist "%PIP_EXE%" (
    echo 检查pandas...
    "%PIP_EXE%" show pandas >nul 2>&1
    if errorlevel 1 (
        echo ❌ pandas未安装
    ) else (
        echo ✅ pandas已安装
    )
    
    echo 检查openpyxl...
    "%PIP_EXE%" show openpyxl >nul 2>&1
    if errorlevel 1 (
        echo ❌ openpyxl未安装
    ) else (
        echo ✅ openpyxl已安装
    )
    
    echo 检查xlrd...
    "%PIP_EXE%" show xlrd >nul 2>&1
    if errorlevel 1 (
        echo ❌ xlrd未安装
    ) else (
        echo ✅ xlrd已安装
    )
) else (
    echo 无法检查（pip未安装）
)
echo.

echo ========================================
echo 检查完成
echo ========================================
echo.
echo 配置建议：
echo   在 apps/api/.env 文件中设置：
echo   PYTHON_PATH=./python-embed/python.exe
echo.
pause

