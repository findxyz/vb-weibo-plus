param([string]$BrowserChannel = 'msedge')

$auditRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$auditFrontend = Join-Path $auditRepoRoot 'frontend'
$auditFixture = Join-Path $auditFrontend 'tests/chat-audit-probes.spec.ts'
$auditPreviousChannel = $env:PREVIEW_BROWSER_CHANNEL
if (Test-Path -LiteralPath $auditFixture) { throw 'Audit fixture already exists.' }

$auditSource = [System.IO.File]::ReadAllText((Join-Path $auditFrontend 'tests/chat.spec.ts'))
$auditCases = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'probes.ts.txt'))
[System.IO.File]::WriteAllText($auditFixture, $auditSource + [Environment]::NewLine + $auditCases,
    [System.Text.UTF8Encoding]::new($false))
Push-Location $auditFrontend
try {
    $env:PREVIEW_BROWSER_CHANNEL = $BrowserChannel
    & npx.cmd playwright test tests/chat-audit-probes.spec.ts -g 'audit_'
    $auditExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
    $env:PREVIEW_BROWSER_CHANNEL = $auditPreviousChannel
    Remove-Item -LiteralPath $auditFixture
}
exit $auditExitCode
