# Create the Nova Market desktop shortcut — an icon on the desktop that opens
# the live Nova Market preview in the default browser.
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot | Split-Path -Parent
$ico = Join-Path $root "assets\nova-market.ico"
$url = "https://nova-market.broken-rain-2495.workers.dev/"

if (-not (Test-Path $ico)) { throw "Missing icon: $ico (run scripts\render-icon.ps1 first)" }

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Nova Market.lnk"

$w = New-Object -ComObject WScript.Shell
$sc = $w.CreateShortcut($shortcutPath)
# explorer.exe delegates to the user's default browser — guaranteed to open the URL.
$sc.TargetPath = "C:\Windows\explorer.exe"
$sc.Arguments = "`"$url`""
$sc.WorkingDirectory = $root
$sc.WindowStyle = 7
$sc.Description = "Nova Market - curated global marketplace (Nova Ecosystem)"
$sc.IconLocation = "$ico,0"
$sc.Save()

Write-Host "Created shortcut: $shortcutPath"
Write-Host "Icon: $ico"
Write-Host "Double-click 'Nova Market' on your Desktop."
