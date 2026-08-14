$ErrorActionPreference = 'Stop'

$Repo = if ($env:UNIPROXY_REPO) { $env:UNIPROXY_REPO } else { 'UNKNOWN052409/proxy' }
$Ref = if ($env:UNIPROXY_REF) { $env:UNIPROXY_REF } else { 'd467983' }
$ExpectedSha256 = if ($env:UNIPROXY_ARCHIVE_SHA256) { $env:UNIPROXY_ARCHIVE_SHA256 } else { '5e0f186a4ae20b890e97b0e9250c27114c6805a1ffc941abd8ab0229b1e072f4' }
$InstallRoot = if ($env:UNIPROXY_INSTALL_ROOT) { $env:UNIPROXY_INSTALL_ROOT } else { Join-Path $HOME '.uniproxy' }
$InstallDir = Join-Path $InstallRoot $Ref
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("npm-uniproxy-" + [guid]::NewGuid().ToString('N'))
$Archive = Join-Path $TempRoot 'source.tar.gz'

if (-not $env:GITHUB_TOKEN) {
  throw 'GITHUB_TOKEN is required because the repository is private. Set it only in the current PowerShell session; do not put it in this script.'
}
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw 'curl.exe is required.' }
if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw 'tar.exe is required (included with modern Windows).' }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js 20+ and npm are required.' }

New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
try {
  $Url = "https://api.github.com/repos/$Repo/tarball/$Ref"
  curl.exe --fail --silent --show-error --location `
    -H 'Accept: application/vnd.github+json' `
    -H "Authorization: Bearer $($env:GITHUB_TOKEN)" `
    -H 'X-GitHub-Api-Version: 2022-11-28' `
    $Url -o $Archive

  $ActualSha256 = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
  if ($ActualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
    throw "Archive checksum mismatch. Expected $ExpectedSha256, got $ActualSha256."
  }

  tar.exe -xzf $Archive -C $TempRoot
  $SourceDir = Get-ChildItem -Directory $TempRoot | Select-Object -First 1
  if (-not $SourceDir -or -not (Test-Path (Join-Path $SourceDir.FullName 'package.json'))) { throw 'Downloaded archive has no package.json.' }

  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
  if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
  Move-Item $SourceDir.FullName $InstallDir
  Push-Location $InstallDir
  try { npm.cmd ci --omit=dev --ignore-scripts } finally { Pop-Location }

  $BinDir = Join-Path $InstallRoot 'bin'
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $Launcher = Join-Path $BinDir 'uniproxy.cmd'
  "@echo off`r`nnode `"$InstallDir\bin\uniproxy.js`" %*`r`n" | Set-Content -Encoding ASCII $Launcher
  Write-Host "Installed npm-uniproxy at $InstallDir"
  Write-Host "Launcher: $Launcher"
  Write-Host "Add $BinDir to your user PATH, then run: uniproxy"
} finally {
  if (Test-Path $TempRoot) { Remove-Item -Recurse -Force $TempRoot }
}
