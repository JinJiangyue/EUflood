@echo off
chcp 65001 >nul
echo ========================================
echo 安装Python依赖包
echo ========================================
echo.

REM 检查嵌入式Python是否存在
set PYTHON_EMBED_DIR=%~dp0..\python-embed
if not exist "%PYTHON_EMBED_DIR%\python.exe" (
    echo 错误：找不到嵌入式Python
    echo 请先运行 setup-embedded-python.bat
    pause
    exit /b 1
)

set PYTHON_EXE=%PYTHON_EMBED_DIR%\python.exe
set PIP_EXE=%PYTHON_EMBED_DIR%\Scripts\pip.exe
set REQUIREMENTS=%~dp0..\src\modules\python\scripts\requirements.txt

echo [1/2] 检查pip...
if not exist "%PIP_EXE%" (
    echo pip未安装，正在安装...
    echo 下载get-pip.py...
    powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%PYTHON_EMBED_DIR%\get-pip.py'"
    
    echo 安装pip...
    "%PYTHON_EXE%" "%PYTHON_EMBED_DIR%\get-pip.py"
    if errorlevel 1 (
        echo 错误：pip安装失败
        pause
        exit /b 1
    )
    
    del "%PYTHON_EMBED_DIR%\get-pip.py" 2>nul
    echo ✅ pip安装成功
) else (
    echo ✅ pip已安装
)
echo.

echo [2/2] 安装Python依赖...
if not exist "%REQUIREMENTS%" (
    echo 警告：requirements.txt不存在
    echo 路径：%REQUIREMENTS%
    pause
    exit /b 1
)

echo 从requirements.txt安装依赖...
"%PIP_EXE%" install -r "%REQUIREMENTS%"
if errorlevel 1 (
    echo 错误：依赖安装失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo 安装完成！
echo ========================================
echo.
echo 已安装的包：
"%PIP_EXE%" list
echo.
pause

