# 带应用内更新签名的构建入口：读取 .tauri-signing.env 设置签名环境变量后执行 tauri build。
# 用法（由 build-win.bat 调用）: powershell -File tauri-build-signed.ps1 <仓库根目录>
$ErrorActionPreference = 'Stop'
$root = ($args[0]).Trim().TrimEnd('\', '"')
Set-Location -LiteralPath $root

$envFile = Join-Path $root '.tauri-signing.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)$') {
      # 只读取签名设置；不输出密钥或密码。
      $name = $Matches[1].Trim()
      $value = $Matches[2]
      if ($name -in @('TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PATH', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD') -and $value) {
        if ($name -like '*PATH' -and -not [IO.Path]::IsPathRooted($value)) {
          $value = Join-Path $root $value
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
      }
    }
  }
}

if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and -not $env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
  Write-Error 'updater signing key not configured: missing .tauri-signing.env'
  exit 1
}

# tauri build 的签名步骤只认 TAURI_SIGNING_PRIVATE_KEY（密钥内容），不认 _PATH：
# 把密钥文件内容读进环境变量（密钥无密码时无需 TAURI_SIGNING_PRIVATE_KEY_PASSWORD）
if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and $env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
  if (-not (Test-Path $env:TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    Write-Error "签名密钥文件不存在: $($env:TAURI_SIGNING_PRIVATE_KEY_PATH)"
    exit 1
  }
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $env:TAURI_SIGNING_PRIVATE_KEY_PATH
}

$env:CRATE_CC_NO_DEFAULTS = '1'
npm run sync-version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/check-release.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run tauri build
exit $LASTEXITCODE
