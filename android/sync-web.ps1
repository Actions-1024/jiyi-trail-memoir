# Copies the current web app into the Android shell assets.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File android\sync-web.ps1
$ErrorActionPreference = 'Stop'

$androidDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $androidDir
$dest = Join-Path $androidDir 'app\src\main\assets\www'

if (Test-Path $dest) {
    Remove-Item -LiteralPath $dest -Recurse -Force
}
New-Item -ItemType Directory -Force $dest | Out-Null

$items = @('index.html', 'manifest.webmanifest', 'sw.js', 'assets', 'js')
foreach ($item in $items) {
    $source = Join-Path $repoRoot $item
    if (-not (Test-Path $source)) {
        throw "Missing web asset: $source"
    }
    Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force
}

# The service worker is kept on disk for completeness, but the web app skips
# registration when window.JiyiAndroid is present.
Write-Host "Synced web assets -> $dest"
Write-Host "Files: $((Get-ChildItem $dest -Recurse -File | Measure-Object).Count)"
