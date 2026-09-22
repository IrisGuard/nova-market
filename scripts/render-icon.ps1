# Render the Nova Market mark (Aurora indigo→violet rounded square + white "N")
# to a multi-size .ico + preview .png. Standalone, no Atlas involved.
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot | Split-Path -Parent
$assetsDir = Join-Path $root "assets"
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }
$outIco = Join-Path $assetsDir "nova-market.ico"
$outPng = Join-Path $assetsDir "nova-market.png"

$cIndigo = [System.Drawing.Color]::FromArgb(255, 79, 70, 229)   # #4F46E5
$cViolet = [System.Drawing.Color]::FromArgb(255, 124, 58, 237)  # #7C3AED
$cWhite  = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$cGlow   = [System.Drawing.Color]::FromArgb(60, 79, 70, 229)

function New-RoundedRectPath([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $d = $r * 2
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Draw-Mark([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $size / 64.0
  $P = { param($v) [float]$v * $s }

  # outer soft glow
  $glow = New-RoundedRectPath $g (& $P 0) (& $P 0) (& $P 64) (& $P 64) (& $P 18)
  $glowPen = New-Object System.Drawing.Pen($cGlow, (& $P 3))
  $g.DrawPath($glowPen, $glow)

  # gradient field
  $field = New-RoundedRectPath $g (& $P 3) (& $P 3) (& $P 58) (& $P 58) (& $P 15)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF((& $P 3), (& $P 3))),
    (New-Object System.Drawing.PointF((& $P 61), (& $P 61))),
    $cIndigo, $cViolet)
  $g.FillPath($brush, $field)

  # white "N"
  $fontSize = [float](& $P 38)
  $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF((& $P 3), (& $P 2), (& $P 58), (& $P 60))
  $g.DrawString("N", $font, (New-Object System.Drawing.SolidBrush($cWhite)), $rect, $sf)

  $g.Dispose()
  return $bmp
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngBytes = New-Object System.Collections.Generic.List[byte[]]
foreach ($size in $sizes) {
  $bmp = Draw-Mark $size
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes.Add($ms.ToArray())
  $ms.Dispose()
  $bmp.Dispose()
}

$ico = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ico)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$sizes.Count)

$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $bw.Write([byte]$dim)
  $bw.Write([byte]$dim)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]32)
  $bw.Write([uint32]$pngBytes[$i].Length)
  $bw.Write([uint32]$offset)
  $offset += $pngBytes[$i].Length
}
foreach ($b in $pngBytes) { $bw.Write($b) }
$bw.Flush()
$data = $ico.ToArray()
$ico.Dispose()
$bw.Dispose()

[System.IO.File]::WriteAllBytes($outIco, $data)

$prev = Draw-Mark 256
$prev.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
$prev.Dispose()

Write-Host "Wrote $outIco ($($data.Length) bytes, $($sizes.Count) sizes)"
Write-Host "Wrote $outPng"
