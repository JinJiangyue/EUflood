@echo off
REM 测试 interpolation.py 脚本的批处理文件
REM 使用方法：直接双击此文件，或从命令行运行

echo ============================================
echo 测试 interpolation.py 脚本
echo ============================================
echo.

REM 切换到脚本目录
cd /d "%~dp0"

REM 检查嵌入式Python是否存在
if exist "..\..\..\..\python-embed\python.exe" (
    echo [测试] 使用嵌入式Python
    set PYTHON_PATH=..\..\..\..\python-embed\python.exe
) else if exist "python-embed\python.exe" (
    echo [测试] 使用本地嵌入式Python
    set PYTHON_PATH=python-embed\python.exe
) else (
    echo [测试] 使用系统Python
    set PYTHON_PATH=python
)

echo [测试] Python路径: %PYTHON_PATH%
echo [测试] 当前目录: %CD%
echo.

REM 运行测试脚本
echo [测试] 开始运行测试...
echo.

%PYTHON_PATH% test_interpolation.py

echo.
echo ============================================
echo 测试完成
echo ============================================
pause



