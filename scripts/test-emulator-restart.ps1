$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$jdkPath = Join-Path $projectRoot '.tools\jdk-21'
$javaPath = Join-Path $jdkPath 'bin\java.exe'
$testStatePath = Join-Path $projectRoot 'tmp\emulator-restart-state'

if (-not (Test-Path -LiteralPath $javaPath)) {
  throw "Portable Java not found: $javaPath. See README-EMULATORS.md."
}
$resolvedRoot = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
$resolvedState = [System.IO.Path]::GetFullPath($testStatePath)
if (-not $resolvedState.StartsWith("$resolvedRoot\tmp\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unsafe restart-test state path.'
}
if (Test-Path -LiteralPath $resolvedState) {
  Remove-Item -LiteralPath $resolvedState -Recurse -Force
}
New-Item -ItemType Directory -Path $resolvedState -Force | Out-Null

$env:JAVA_HOME = $jdkPath
$env:Path = "$jdkPath\bin;$env:Path"
$env:PIRATE_TEACHER_EMAIL = 'restart-teacher@example.test'
$env:PIRATE_TEACHER_PASSWORD = 'Restart-Test-24680'

try {
  & firebase.cmd emulators:exec --project demo-pirate-auth --only auth,firestore --export-on-exit=$resolvedState 'node scripts/seed-emulator-teacher.js'
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare restart-test state.' }

  $env:PIRATE_RESTART_TEST = '1'
  & firebase.cmd emulators:exec --project demo-pirate-auth --only auth,firestore --import=$resolvedState 'node --test tests/teacher-emulator-restart.test.js'
  if ($LASTEXITCODE -ne 0) { throw 'Teacher login failed after emulator restart.' }
} finally {
  Remove-Item Env:PIRATE_RESTART_TEST -ErrorAction SilentlyContinue
  Remove-Item Env:PIRATE_TEACHER_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:PIRATE_TEACHER_PASSWORD -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $resolvedState) {
    Remove-Item -LiteralPath $resolvedState -Recurse -Force
  }
}
