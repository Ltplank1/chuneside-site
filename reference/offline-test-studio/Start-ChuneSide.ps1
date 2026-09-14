$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host ""
Write-Host "ChuneSide Offline Test Studio is running." -ForegroundColor Green
Write-Host "Keep this window open while you test. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

$edge = Get-Command msedge.exe -ErrorAction SilentlyContinue
if ($edge) { Start-Process $edge.Source "--app=$prefix" } else { Start-Process $prefix }

$mime = @{
  ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="text/javascript; charset=utf-8";
  ".json"="application/json; charset=utf-8"; ".webmanifest"="application/manifest+json"; ".png"="image/png";
  ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".svg"="image/svg+xml"; ".mp3"="audio/mpeg";
  ".wav"="audio/wav"; ".m4a"="audio/mp4"; ".mp4"="video/mp4"; ".webm"="video/webm"
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
    $requested = [IO.Path]::GetFullPath((Join-Path $appRoot $relative))
    if (-not $requested.StartsWith([IO.Path]::GetFullPath($appRoot))) {
      $context.Response.StatusCode = 403
      $context.Response.Close()
      continue
    }
    if (-not (Test-Path $requested -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $context.Response.Close()
      continue
    }
    $extension = [IO.Path]::GetExtension($requested).ToLowerInvariant()
    $context.Response.ContentType = $(if ($mime.ContainsKey($extension)) { $mime[$extension] } else { "application/octet-stream" })
    $bytes = [IO.File]::ReadAllBytes($requested)
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.OutputStream.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
