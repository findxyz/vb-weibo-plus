$ErrorActionPreference = 'Stop'

$rustProject = Split-Path -Parent $PSScriptRoot
$frontendProject = Join-Path $rustProject '../../frontend'
$target = Join-Path $rustProject 'target'
$release = Join-Path $target 'release'
$releaseFiles = @('weibo-plus.exe', 'WebView2Loader.dll')

Push-Location -LiteralPath $rustProject
try {
    $compiler = rustc -vV
    if ($LASTEXITCODE -ne 0 -or -not ($compiler -match '^host: x86_64-pc-windows-gnu$')) {
        throw 'The release requires the x86_64-pc-windows-gnu Rust toolchain to bundle WebView2Loader.dll.'
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

    $loaderBuild = $events | Where-Object {
        $_.reason -eq 'build-script-executed' -and $_.package_id -match '[/#]webview2-com-sys@'
    } | Select-Object -First 1
    if (-not $loaderBuild) { throw 'Could not locate the WebView2 loader build output.' }
    Copy-Item -LiteralPath (Join-Path $loaderBuild.out_dir 'x64/WebView2Loader.dll') -Destination $release
} finally {
    Pop-Location
}

$archive = Join-Path $target 'weibo-plus-rust.7z'
tar.exe --format 7zip -cf $archive -C $release @releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'Creating the Rust release archive failed.' }
Get-Item -LiteralPath $archive
