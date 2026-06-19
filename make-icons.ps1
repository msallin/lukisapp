# Generates the PNG app icons for Lukis from a solid background and a glyph.
# Run with Windows PowerShell:
#   powershell -ExecutionPolicy Bypass -File make-icons.ps1
# Re-run after changing $Color or $Glyph to refresh the icons.

Add-Type -AssemblyName System.Drawing

$Color = '#2563eb'
$Glyph = 'L'
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-Icon([int]$size, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($Color))

  $font = New-Object System.Drawing.Font('Segoe UI', [int]($size * 0.5), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $g.DrawString($Glyph, $font, [System.Drawing.Brushes]::White, $rect, $sf)

  $g.Dispose()
  $path = Join-Path $here $file
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $file ($size x $size)"
}

New-Icon 192 'icon-192.png'
New-Icon 512 'icon-512.png'
New-Icon 180 'apple-touch-icon.png'
