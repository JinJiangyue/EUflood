#!/bin/bash
# Python脚本打包工具（Linux/Mac版本）

echo "========================================"
echo "Python脚本打包工具"
echo "========================================"
echo ""

# 切换到脚本目录
SCRIPT_DIR="$(cd "$(dirname "$0")/../src/modules/python/scripts" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo "[1/3] 检查PyInstaller..."
if ! python3 -m pip show pyinstaller >/dev/null 2>&1; then
    echo "PyInstaller未安装，正在安装..."
    python3 -m pip install pyinstaller
    if [ $? -ne 0 ]; then
        echo "错误：PyInstaller安装失败"
        exit 1
    fi
else
    echo "PyInstaller已安装"
fi
echo ""

echo "[2/3] 打包Python脚本..."
echo ""

# 打包process_file.py
if [ -f "process_file.py" ]; then
    echo "正在打包 process_file.py..."
    pyinstaller --onefile --name process_file --clean --noconsole process_file.py
    if [ $? -eq 0 ]; then
        echo "✅ process_file 打包成功"
    else
        echo "警告：process_file.py 打包失败"
    fi
    echo ""
fi

# 打包example.py
if [ -f "example.py" ]; then
    echo "正在打包 example.py..."
    pyinstaller --onefile --name example --clean --noconsole example.py
    if [ $? -eq 0 ]; then
        echo "✅ example 打包成功"
    else
        echo "警告：example.py 打包失败"
    fi
    echo ""
fi

# 打包test_example.py
if [ -f "test_example.py" ]; then
    echo "正在打包 test_example.py..."
    pyinstaller --onefile --name test_example --clean --noconsole test_example.py
    if [ $? -eq 0 ]; then
        echo "✅ test_example 打包成功"
    else
        echo "警告：test_example.py 打包失败"
    fi
    echo ""
fi

echo "[3/3] 整理文件..."
# 复制exe到scripts目录（Linux/Mac下是二进制文件，不是exe）
if [ -f "dist/process_file" ]; then
    cp -f "dist/process_file" "process_file" 2>/dev/null
    chmod +x "process_file"
    echo "✅ process_file 已复制到scripts目录"
fi
if [ -f "dist/example" ]; then
    cp -f "dist/example" "example" 2>/dev/null
    chmod +x "example"
    echo "✅ example 已复制到scripts目录"
fi
if [ -f "dist/test_example" ]; then
    cp -f "dist/test_example" "test_example" 2>/dev/null
    chmod +x "test_example"
    echo "✅ test_example 已复制到scripts目录"
fi

echo ""
echo "========================================"
echo "打包完成！"
echo "========================================"
echo ""
echo "打包后的文件位置："
echo "  - scripts目录：$SCRIPT_DIR"
echo "  - dist目录：$SCRIPT_DIR/dist"
echo ""
echo "注意："
echo "  - 开发环境：直接使用Python脚本（.py）"
echo "  - 生产环境：使用打包后的可执行文件"
echo "  - 系统会自动检测并使用可执行文件（如果存在）"
echo ""

