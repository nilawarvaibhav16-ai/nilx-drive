Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root 'app\src\main\res'
$densities = @{
    'mdpi'    = 48
    'hdpi'    = 72
    'xhdpi'   = 96
    'xxhdpi'  = 144
    'xxxhdpi' = 192
}

function New-RoundedPath([System.Drawing.RectangleF]$rect, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $arc = New-Object System.Drawing.RectangleF($rect.X, $rect.Y, $diameter, $diameter)
    $path.AddArc($arc, 180, 90)
    $arc.X = $rect.Right - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $rect.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $rect.X
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Master([bool]$round) {
    $size = 512
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.RectangleF(8, 8, 496, 496)
    if ($round) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse($rect)
    } else {
        $path = New-RoundedPath $rect 108
    }

    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 7, 12, 17),
        [System.Drawing.Color]::FromArgb(255, 24, 38, 26),
        42.0
    )
    $g.FillPath($bg, $path)

    $g.SetClip($path)
    $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(48, 182, 255, 60))
    $g.FillEllipse($glow, 212, 196, 300, 300)
    $ember = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(42, 255, 122, 47))
    $g.FillEllipse($ember, -60, 300, 260, 260)

    $slash = New-Object System.Drawing.Drawing2D.GraphicsPath
    $slash.AddPolygon(@(
        (New-Object System.Drawing.PointF(82, 392)),
        (New-Object System.Drawing.PointF(176, 392)),
        (New-Object System.Drawing.PointF(430, 120)),
        (New-Object System.Drawing.PointF(336, 120))
    ))
    $slashBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(238, 182, 255, 60))
    $g.FillPath($slashBrush, $slash)
    $g.ResetClip()

    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(150, 182, 255, 60), 5.0)
    $g.DrawPath($borderPen, $path)

    $font = New-Object System.Drawing.Font('Arial Black', 198, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF(0, 6, 512, 512)
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(135, 0, 0, 0))
    $g.DrawString('NX', $font, $shadowBrush, (New-Object System.Drawing.RectangleF(0, 12, 512, 512)), $format)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 246, 250, 242))
    $g.DrawString('NX', $font, $textBrush, $textRect, $format)

    $g.Dispose()
    return $bmp
}

$masterSquare = New-Master $false
$masterRound = New-Master $true

foreach ($entry in $densities.GetEnumerator()) {
    $dir = Join-Path $res ('mipmap-' + $entry.Key)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $target = [int]$entry.Value
    foreach ($variant in @(
        @{ name = 'ic_launcher.png'; source = $masterSquare },
        @{ name = 'ic_launcher_round.png'; source = $masterRound }
    )) {
        $out = New-Object System.Drawing.Bitmap($target, $target, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($out)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($variant.source, 0, 0, $target, $target)
        $g.Dispose()
        $out.Save((Join-Path $dir $variant.name), [System.Drawing.Imaging.ImageFormat]::Png)
        $out.Dispose()
    }
}

$masterSquare.Dispose()
$masterRound.Dispose()
Write-Output 'Launcher icons generated.'
