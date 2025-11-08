# 嵌入式Python安装脚本（Windows PowerShell）
# 自动下载并配置嵌入式Python

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "嵌入式Python安装工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 确定Python版本
$pythonVersion = "3.12.7"  # 可以修改版本号
$pythonVersionShort = "3.12"

# 确定架构（64位或32位）
$arch = "amd64"  # 64位，如果是32位系统改为 "win32"
if ([Environment]::Is64BitOperatingSystem) {
    $arch = "amd64"
} else {
    $arch = "win32"
}

# 下载URL
$downloadUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-$arch.zip"
$zipFileName = "python-$pythonVersion-embed-$arch.zip"

# 目标目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$embedDir = Join-Path $projectRoot "python-embed"

Write-Host "[1/5] 检查目标目录..." -ForegroundColor Yellow
if (Test-Path $embedDir) {
    Write-Host "警告：目录已存在：$embedDir" -ForegroundColor Yellow
    $overwrite = Read-Host "是否覆盖？(y/n)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "已取消" -ForegroundColor Red
        exit 0
    }
    Remove-Item -Path $embedDir -Recurse -Force
}
New-Item -ItemType Directory -Path $embedDir -Force | Out-Null
Write-Host "✅ 目标目录已创建：$embedDir" -ForegroundColor Green
Write-Host ""

# 临时下载目录
$tempDir = Join-Path $env:TEMP "python-embed-download"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$zipPath = Join-Path $tempDir $zipFileName

Write-Host "[2/5] 下载嵌入式Python..." -ForegroundColor Yellow
Write-Host "版本：$pythonVersion" -ForegroundColor Gray
Write-Host "架构：$arch" -ForegroundColor Gray
Write-Host "URL：$downloadUrl" -ForegroundColor Gray
Write-Host ""

try {
    Write-Host "正在下载..." -ForegroundColor Yellow
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "✅ 下载完成" -ForegroundColor Green
} catch {
    Write-Host "❌ 下载失败：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "请手动下载：" -ForegroundColor Yellow
    Write-Host "1. 访问：https://www.python.org/downloads/windows/" -ForegroundColor Yellow
    Write-Host "2. 选择 'Windows embeddable package'" -ForegroundColor Yellow
    Write-Host "3. 下载对应版本和架构的zip文件" -ForegroundColor Yellow
    Write-Host "4. 解压到：$embedDir" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

Write-Host "[3/5] 解压文件..." -ForegroundColor Yellow
try {
    Expand-Archive -Path $zipPath -DestinationPath $embedDir -Force
    Write-Host "✅ 解压完成" -ForegroundColor Green
} catch {
    Write-Host "❌ 解压失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "[4/5] 配置嵌入式Python..." -ForegroundColor Yellow

# 启用pip（取消注释python312._pth中的import site）
$pthFile = Join-Path $embedDir "python$($pythonVersionShort.Replace('.',''))_emb._pth"
if (Test-Path $pthFile) {
    $content = Get-Content $pthFile -Raw
    # 取消注释 import site
    $content = $content -replace '#import site', 'import site'
    Set-Content -Path $pthFile -Value $content -NoNewline
    Write-Host "✅ 已启用pip支持" -ForegroundColor Green
} else {
    Write-Host "⚠️  未找到.pth文件，pip可能需要手动配置" -ForegroundColor Yellow
}

# 创建get-pip.py下载脚本
$getPipPath = Join-Path $embedDir "get-pip.py"
Write-Host "下载get-pip.py..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPipPath -UseBasicParsing
    Write-Host "✅ get-pip.py已下载" -ForegroundColor Green
} catch {
    Write-Host "⚠️  get-pip.py下载失败，请手动下载" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "[5/5] 生成配置文件..." -ForegroundColor Yellow

# 生成.env配置
$envFile = Join-Path $projectRoot ".env"
$pythonExePath = Join-Path $embedDir "python.exe"

# 检查.env文件是否存在
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -notmatch "PYTHON_PATH=") {
        Add-Content -Path $envFile -Value "`n# 嵌入式Python路径`nPYTHON_PATH=$pythonExePath"
        Write-Host "✅ 已更新.env文件" -ForegroundColor Green
    } else {
        Write-Host "⚠️  .env文件已包含PYTHON_PATH，请手动检查" -ForegroundColor Yellow
    }
} else {
    $envContent = @"
# Python配置
PYTHON_PATH=$pythonExePath
PYTHON_SCRIPT_DIR=./src/modules/python/scripts
PYTHON_TIMEOUT=30000

# 文件上传配置
UPLOAD_DIR=./uploads
OUTPUT_DIR=./outputs
"@
    Set-Content -Path $envFile -Value $envContent
    Write-Host "✅ 已创建.env文件" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "安装完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "嵌入式Python位置：$embedDir" -ForegroundColor Green
Write-Host "Python可执行文件：$pythonExePath" -ForegroundColor Green
Write-Host ""
Write-Host "下一步：" -ForegroundColor Yellow
Write-Host "1. 安装pip（如果需要）：" -ForegroundColor White
Write-Host "   $pythonExePath $getPipPath" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 安装依赖：" -ForegroundColor White
Write-Host "   $pythonExePath -m pip install -r src\modules\python\scripts\requirements.txt" -ForegroundColor Gray
Write-Host ""
Write-Host "3. 测试Python：" -ForegroundColor White
Write-Host "   $pythonExePath --version" -ForegroundColor Gray
Write-Host ""
Write-Host "4. 重启API服务使配置生效" -ForegroundColor White
Write-Host ""

# 清理临时文件
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

