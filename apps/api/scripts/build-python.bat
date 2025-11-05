@echo off
chcp 65001 >nul
echo ========================================
echo Python脚本打包工具
echo ========================================
echo.

REM 切换到脚本目录
cd /d "%~dp0..\src\modules\python\scripts"
if errorlevel 1 (
    echo 错误：无法切换到脚本目录
    pause
    exit /b 1
)

echo [1/3] 检查PyInstaller...
python -m pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo PyInstaller未安装，正在安装...
    python -m pip install pyinstaller
    if errorlevel 1 (
        echo 错误：PyInstaller安装失败
        pause
        exit /b 1
    )
) else (
    echo PyInstaller已安装
)
echo.

echo [2/3] 打包Python脚本...
echo.

REM 打包process_file.py
if exist "process_file.py" (
    echo 正在打包 process_file.py...
    pyinstaller --onefile --name process_file --clean --noconsole process_file.py
    if errorlevel 1 (
        echo 警告：process_file.py 打包失败
    ) else (
        echo ✅ process_file.py 打包成功
    )
    echo.
)

REM 打包example.py
if exist "example.py" (
    echo 正在打包 example.py...
    pyinstaller --onefile --name example --clean --noconsole example.py
    if errorlevel 1 (
        echo 警告：example.py 打包失败
    ) else (
        echo ✅ example.py 打包成功
    )
    echo.
)

REM 打包test_example.py
if exist "test_example.py" (
    echo 正在打包 test_example.py...
    pyinstaller --onefile --name test_example --clean --noconsole test_example.py
    if errorlevel 1 (
        echo 警告：test_example.py 打包失败
    ) else (
        echo ✅ test_example.py 打包成功
    )
    echo.
)

echo [3/3] 整理文件...
REM 移动exe到scripts目录（如果存在）
if exist "dist\process_file.exe" (
    copy /Y "dist\process_file.exe" "process_file.exe" >nul
    echo ✅ process_file.exe 已复制到scripts目录
)
if exist "dist\example.exe" (
    copy /Y "dist\example.exe" "example.exe" >nul
    echo ✅ example.exe 已复制到scripts目录
)
if exist "dist\test_example.exe" (
    copy /Y "dist\test_example.exe" "test_example.exe" >nul
    echo ✅ test_example.exe 已复制到scripts目录
)

echo.
echo ========================================
echo 打包完成！
echo ========================================
echo.
echo 打包后的exe文件位置：
echo   - scripts目录：%CD%
echo   - dist目录：%CD%\dist
echo.
echo 注意：
echo   - 开发环境：直接使用Python脚本（.py）
echo   - 生产环境：使用打包后的exe（.exe）
echo   - 系统会自动检测并使用exe（如果存在）
echo.
pause

