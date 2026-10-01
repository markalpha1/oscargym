# Tiny local web server for testing the app — no installs needed.
#   powershell -ExecutionPolicy Bypass -File .\serve.ps1
# then open http://localhost:8787 (Ctrl+C to stop).
param([int]$Port = 8787)

$root = $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='application/javascript'; '.json'='application/json';
            '.webmanifest'='application/manifest+json'; '.svg'='image/svg+xml'; '.png'='image/png'; '.ico'='image/x-icon' }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = Join-Path $root $rel
    $res = $ctx.Response
    $res.Headers['Cache-Control'] = 'no-store'
    if ((Test-Path $path -PathType Leaf) -and ([IO.Path]::GetFullPath($path)).StartsWith($root)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    $res.Close()
    Write-Host ("{0} {1}" -f $res.StatusCode, $rel)
  }
} finally { $listener.Stop() }
