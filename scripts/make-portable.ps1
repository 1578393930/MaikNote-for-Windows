param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$version = (Get-Content -LiteralPath (Join-Path $Root 'version.json') -Raw | ConvertFrom-Json).version
$output = Join-Path $Root 'release-portable'
New-Item -ItemType Directory -Path $output -Force | Out-Null
# A unique clean stage avoids including old ZIPs, installers or manifests.
$stage = Join-Path $output ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  Copy-Item -LiteralPath (Join-Path $Root 'src-tauri/target/release/maiknote.exe') -Destination (Join-Path $stage 'MaikNote.exe')
  Copy-Item -LiteralPath (Join-Path $Root 'docs/portable-readme.txt') -Destination (Join-Path $stage 'README.txt')
  Copy-Item -LiteralPath (Join-Path $stage 'MaikNote.exe') -Destination (Join-Path $output 'MaikNote.exe')
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $output "MaikNote_${version}_x64-portable.zip") -Force
} finally {
  # The generated stage is a direct child of the known output directory.
  $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
  if ([IO.Path]::GetDirectoryName($resolvedStage) -ne $output) { throw 'Invalid staging directory' }
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
