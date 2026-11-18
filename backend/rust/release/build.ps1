$ErrorActionPreference = 'Stop'

$rustProject = Split-Path -Parent $PSScriptRoot
$frontendProject = Join-Path $rustProject '../../frontend'
$target = Join-Path $rustProject 'target'

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
    cargo build --locked --release --features embed-frontend --target-dir $target
    if ($LASTEXITCODE -ne 0) { throw 'Building the Rust executable failed.' }
} finally {
    Pop-Location
}

$archive = Join-Path $target 'weibo-plus-rust.7z'
tar.exe --format 7zip -cf $archive -C (Join-Path $target 'release') weibo-plus.exe
if ($LASTEXITCODE -ne 0) { throw 'Creating the Rust release archive failed.' }
Get-Item -LiteralPath $archive
