#!/bin/bash
# 嵌入式Python安装脚本（Linux/Mac版本）

set -e

echo "========================================"
echo "嵌入式Python安装工具"
echo "========================================"
echo ""

# 确定Python版本
PYTHON_VERSION="3.12.7"
PYTHON_VERSION_SHORT="3.12"

# 确定架构
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    ARCH="x86_64"
elif [[ "$ARCH" == "aarch64" ]]; then
    ARCH="aarch64"
else
    echo "⚠️  未知架构：$ARCH"
    ARCH="x86_64"
fi

# 确定操作系统
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

echo "[1/4] 检查系统环境..."
echo "操作系统：$OS"
echo "架构：$ARCH"
echo ""

# 对于Linux/Mac，通常使用系统Python或通过pyenv安装
# 这里提供另一种方案：使用pyenv或创建虚拟环境

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EMBED_DIR="$PROJECT_ROOT/python-embed"

echo "[2/4] 检查目标目录..."
if [ -d "$EMBED_DIR" ]; then
    echo "警告：目录已存在：$EMBED_DIR"
    read -p "是否覆盖？(y/n): " overwrite
    if [[ "$overwrite" != "y" && "$overwrite" != "Y" ]]; then
        echo "已取消"
        exit 0
    fi
    rm -rf "$EMBED_DIR"
fi
mkdir -p "$EMBED_DIR"
echo "✅ 目标目录已创建：$EMBED_DIR"
echo ""

echo "[3/4] 配置Python环境..."

# 对于Linux/Mac，建议使用系统Python或创建虚拟环境
# 这里创建符号链接或使用pyenv

# 方案1：使用系统Python（如果存在）
if command -v python3 &> /dev/null; then
    PYTHON_PATH=$(which python3)
    echo "✅ 找到系统Python：$PYTHON_PATH"
    
    # 创建符号链接
    ln -sf "$PYTHON_PATH" "$EMBED_DIR/python" 2>/dev/null || cp "$PYTHON_PATH" "$EMBED_DIR/python"
    echo "✅ 已创建符号链接"
else
    echo "⚠️  未找到系统Python"
    echo "请安装Python或使用pyenv"
    exit 1
fi

echo ""
echo "[4/4] 生成配置文件..."

# 生成.env配置
ENV_FILE="$PROJECT_ROOT/.env"
PYTHON_EXE_PATH="$EMBED_DIR/python"

if [ -f "$ENV_FILE" ]; then
    if ! grep -q "PYTHON_PATH=" "$ENV_FILE"; then
        echo "" >> "$ENV_FILE"
        echo "# 嵌入式Python路径" >> "$ENV_FILE"
        echo "PYTHON_PATH=$PYTHON_EXE_PATH" >> "$ENV_FILE"
        echo "✅ 已更新.env文件"
    else
        echo "⚠️  .env文件已包含PYTHON_PATH，请手动检查"
    fi
else
    cat > "$ENV_FILE" << EOF
# Python配置
PYTHON_PATH=$PYTHON_EXE_PATH
PYTHON_SCRIPT_DIR=./src/modules/python/scripts
PYTHON_TIMEOUT=30000

# 文件上传配置
UPLOAD_DIR=./uploads
OUTPUT_DIR=./outputs
EOF
    echo "✅ 已创建.env文件"
fi

echo ""
echo "========================================"
echo "安装完成！"
echo "========================================"
echo ""
echo "Python位置：$EMBED_DIR"
echo "Python可执行文件：$PYTHON_EXE_PATH"
echo ""
echo "下一步："
echo "1. 安装依赖："
echo "   $PYTHON_EXE_PATH -m pip install -r src/modules/python/scripts/requirements.txt"
echo ""
echo "2. 测试Python："
echo "   $PYTHON_EXE_PATH --version"
echo ""
echo "3. 重启API服务使配置生效"
echo ""

