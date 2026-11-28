$ErrorActionPreference = 'Stop'

$rustProject = Split-Path -Parent $PSScriptRoot
$frontendProject = Join-Path $rustProject '../../frontend'
$target = Join-Path $rustProject 'target'
$release = Join-Path $target 'release'
$releaseFiles = @('weibo-plus.exe')

Push-Location -LiteralPath $rustProject
try {
    $compiler = rustc -vV
    if ($LASTEXITCODE -ne 0 -or -not ($compiler -match '^host: x86_64-pc-windows-msvc$')) {
        throw 'The release requires the x86_64-pc-windows-msvc Rust toolchain to statically link WebView2Loader and produce a valid Windows executable.'
    }
} finally {
    Pop-Location
}

Push-Location -LiteralPath $frontendProject
try {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Installing frontend dependencies failed.' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Building the frontend failed.' }
} finally {
    Pop-Location
}

Push-Location -LiteralPath $rustProject
try {
    $messages = cargo build --locked --release --features desktop --target-dir $target --message-format=json-render-diagnostics
    if ($LASTEXITCODE -ne 0) { throw 'Building the Rust executable failed.' }

    $events = $messages | ForEach-Object { ConvertFrom-Json -InputObject $_ }
    $exeBuild = $events | Where-Object {
        $_.reason -eq 'compiler-artifact' -and $_.target.name -eq 'weibo-plus' -and $_.executable
    } | Select-Object -First 1
    $expectedExe = Join-Path $release 'weibo-plus.exe'
    if (-not $exeBuild -or [IO.Path]::GetFullPath($exeBuild.executable) -ne $expectedExe) {
        throw 'Cargo did not report the release executable at target/release/weibo-plus.exe. Check Cargo target overrides.'
    }
} finally {
    Pop-Location
}

$smokeDir = Join-Path ([IO.Path]::GetTempPath()) ("weibo-plus-smoke-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $smokeDir | Out-Null
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$probe.Start()
$smokePort = ([Net.IPEndPoint]$probe.LocalEndpoint).Port
$probe.Stop()
$smokeProc = $null
try {
    $smokeProc = Start-Process -FilePath (Join-Path $release 'weibo-plus.exe') `
        -WorkingDirectory $smokeDir `
        -ArgumentList "--server.port=$smokePort", '--weibo.open-browser=false', "--weibo.database-path=$(Join-Path $smokeDir 'smoke.db')", "--weibo.cookie-file=$(Join-Path $smokeDir 'cookie.txt')" `
        -PassThru
    $ready = $false
    for ($i = 0; $i -lt 50; $i++) {
        if ($smokeProc.HasExited) {
            throw ("Smoke check failed: weibo-plus.exe exited prematurely with code 0x{0:X8}." -f $smokeProc.ExitCode)
        }
        try {
            $postResp = Invoke-WebRequest -Uri "http://127.0.0.1:$smokePort/post/index.html" -UseBasicParsing -TimeoutSec 2
            $chatResp = Invoke-WebRequest -Uri "http://127.0.0.1:$smokePort/chat/index.html" -UseBasicParsing -TimeoutSec 2
            if ($postResp.StatusCode -eq 200 -and $chatResp.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }
    if (-not $ready) {
        throw 'Smoke check failed: weibo-plus.exe did not serve /post/index.html and /chat/index.html in time.'
    }
} finally {
    if ($smokeProc -and -not $smokeProc.HasExited) {
        Stop-Process -Id $smokeProc.Id -Force
        $smokeProc.WaitForExit(3000) | Out-Null
    }
    Remove-Item -LiteralPath $smokeDir -Recurse -Force -ErrorAction SilentlyContinue
}

$archive = Join-Path $target 'weibo-plus-rust.7z'
tar.exe --format 7zip -cf $archive -C $release @releaseFiles -C $PSScriptRoot 'weibo-plus.properties'
if ($LASTEXITCODE -ne 0) { throw 'Creating the Rust release archive failed.' }
Get-Item -LiteralPath $archive
