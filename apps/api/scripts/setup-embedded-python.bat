@echo off
chcp 65001 >nul
echo ========================================
echo 嵌入式Python安装脚本
echo ========================================
echo.

REM 设置变量
set PYTHON_VERSION=3.12.0
set PYTHON_ARCH=amd64
set PYTHON_EMBED_DIR=%~dp0..\python-embed
set PYTHON_EMBED_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-%PYTHON_ARCH%.zip

REM 检查架构（32位还是64位）
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set PYTHON_ARCH=amd64
) else if "%PROCESSOR_ARCHITECTURE%"=="x86" (
    set PYTHON_ARCH=win32
) else (
    echo 无法检测系统架构，使用默认amd64
    set PYTHON_ARCH=amd64
)

echo [1/4] 检查目标目录...
if exist "%PYTHON_EMBED_DIR%" (
    echo 目录已存在：%PYTHON_EMBED_DIR%
    echo 是否要删除并重新安装？(Y/N)
    set /p choice=
    if /i "%choice%"=="Y" (
        rmdir /s /q "%PYTHON_EMBED_DIR%" 2>nul
    ) else (
        echo 已取消安装
        pause
        exit /b 0
    )
)
mkdir "%PYTHON_EMBED_DIR%" 2>nul
echo ✅ 目录已创建
echo.

echo [2/4] 下载嵌入式Python...
echo 版本：%PYTHON_VERSION%
echo 架构：%PYTHON_ARCH%
echo URL：%PYTHON_EMBED_URL%
echo.
echo 正在下载，请稍候...
echo.

REM 检查是否安装了curl或PowerShell
where curl >nul 2>&1
if %errorlevel% equ 0 (
    echo 使用curl下载...
    curl -L -o "%PYTHON_EMBED_DIR%\python-embed.zip" "%PYTHON_EMBED_URL%"
    if errorlevel 1 (
        echo 错误：curl下载失败，尝试使用PowerShell...
        goto :powershell_download
    )
) else (
    goto :powershell_download
)
goto :extract

:powershell_download
echo 使用PowerShell下载...
powershell -Command "Invoke-WebRequest -Uri '%PYTHON_EMBED_URL%' -OutFile '%PYTHON_EMBED_DIR%\python-embed.zip'"
if errorlevel 1 (
    echo 错误：下载失败
    echo 请手动下载：%PYTHON_EMBED_URL%
    echo 保存到：%PYTHON_EMBED_DIR%\python-embed.zip
    pause
    exit /b 1
)

:extract
echo.
echo [3/4] 解压嵌入式Python...
powershell -Command "Expand-Archive -Path '%PYTHON_EMBED_DIR%\python-embed.zip' -DestinationPath '%PYTHON_EMBED_DIR%' -Force"
if errorlevel 1 (
    echo 错误：解压失败
    echo 请手动解压：%PYTHON_EMBED_DIR%\python-embed.zip
    pause
    exit /b 1
)

REM 删除zip文件
del "%PYTHON_EMBED_DIR%\python-embed.zip" 2>nul

echo ✅ 解压完成
echo.

echo [4/4] 配置嵌入式Python...
REM 启用pip（取消python312._pth中的注释）
set PYTHON_PTH=%PYTHON_EMBED_DIR%\python%PYTHON_VERSION:~0,1%%PYTHON_VERSION:~2,1%._pth
if exist "%PYTHON_PTH%" (
    REM 备份原文件
    copy "%PYTHON_PTH%" "%PYTHON_PTH%.backup" >nul
    
    REM 取消注释import site（需要启用pip）
    powershell -Command "(Get-Content '%PYTHON_PTH%') -replace '#import site', 'import site' | Set-Content '%PYTHON_PTH%'"
    echo ✅ 已启用pip支持
)

REM 创建get-pip.py下载脚本
echo 正在下载get-pip.py...
powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%PYTHON_EMBED_DIR%\get-pip.py'"

REM 安装pip
echo 正在安装pip...
"%PYTHON_EMBED_DIR%\python.exe" "%PYTHON_EMBED_DIR%\get-pip.py"
if errorlevel 1 (
    echo 警告：pip安装失败，可能需要手动安装
) else (
    echo ✅ pip安装成功
)

REM 删除get-pip.py
del "%PYTHON_EMBED_DIR%\get-pip.py" 2>nul

echo.
echo ========================================
echo 安装完成！
echo ========================================
echo.
echo 嵌入式Python位置：%PYTHON_EMBED_DIR%
echo Python版本：
"%PYTHON_EMBED_DIR%\python.exe" --version
echo.
echo 下一步：
echo   1. 运行 install-python-deps.bat 安装Python依赖
echo   2. 在 .env 文件中设置：PYTHON_PATH=./python-embed/python.exe
echo.
pause

