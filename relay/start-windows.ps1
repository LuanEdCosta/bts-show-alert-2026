$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$nodeVersion = "v24.22.1"

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $local = Join-Path $env:LOCALAPPDATA "bts-show-alert\node\node.exe"
  if (Test-Path $local) { return $local }
  return $null
}

function Install-Node {
  $arch = "x64"
  if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") {
    $arch = "arm64"
  }
  $name = "node-$nodeVersion-win-$arch"
  $destParent = Join-Path $env:LOCALAPPDATA "bts-show-alert"
  $zip = Join-Path $destParent "$name.zip"
  $extract = Join-Path $destParent "extract"
  $dest = Join-Path $destParent "node"
  New-Item -ItemType Directory -Force -Path $destParent | Out-Null
  $url = "https://nodejs.org/dist/$nodeVersion/$name.zip"
  Write-Host "Baixando Node $nodeVersion para $destParent"
  Invoke-WebRequest -Uri $url -OutFile $zip
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extract
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Move-Item (Join-Path $extract $name) $dest
  Remove-Item $zip -Force
  Remove-Item $extract -Recurse -Force
  $exe = Join-Path $dest "node.exe"
  if (-not (Test-Path $exe)) { throw "O Node foi baixado, mas node.exe não apareceu" }
  return $exe
}

$node = Find-Node
if (-not $node) { $node = Install-Node }
Write-Host "Encaminhador usando $node"
& $node (Join-Path $root "relay\push-relay.mjs")
exit $LASTEXITCODE
