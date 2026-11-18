$ErrorActionPreference = 'Stop'

$rustProject = Split-Path -Parent $PSScriptRoot
$frontendProject = Join-Path $rustProject '../../frontend'
$target = Join-Path $rustProject 'target'
$release = Join-Path $target 'release'
$releaseFiles = @('weibo-plus.exe')

$compiler = rustc -vV
if ($LASTEXITCODE -ne 0 -or -not ($compiler -match '^host: x86_64-pc-windows-(msvc|gnu)$')) {
    throw 'The release requires a Windows x64 Rust toolchain.'
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

    if ($compiler -match '^host: x86_64-pc-windows-gnu$') {
        $loaderBuild = $messages | ForEach-Object { ConvertFrom-Json -InputObject $_ } | Where-Object {
            $_.reason -eq 'build-script-executed' -and $_.package_id -match '[/#]webview2-com-sys@'
        } | Select-Object -First 1
        if (-not $loaderBuild) { throw 'Could not locate the WebView2 loader build output.' }
        Copy-Item -LiteralPath (Join-Path $loaderBuild.out_dir 'x64/WebView2Loader.dll') -Destination $release
        $releaseFiles += 'WebView2Loader.dll'
    }
} finally {
    Pop-Location
}

$archive = Join-Path $target 'weibo-plus-rust.7z'
tar.exe --format 7zip -cf $archive -C $release @releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'Creating the Rust release archive failed.' }
Get-Item -LiteralPath $archive
