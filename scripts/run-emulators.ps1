param([switch]$Test)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$jdkPath = Join-Path $projectRoot '.tools\jdk-21'
$javaPath = Join-Path $jdkPath 'bin\java.exe'
if (-not (Test-Path -LiteralPath $javaPath)) {
  throw "Portable Java not found: $javaPath. See README-EMULATORS.md."
}

$env:JAVA_HOME = $jdkPath
$env:Path = "$jdkPath\bin;$env:Path"
if ($Test) {
  # Automated tests use a separate logical project so clearFirestore() can
  # never erase the data used for manual browser checks.
  & firebase.cmd emulators:exec --project demo-pirate-tests --only auth,firestore 'npm.cmd test'
} else {
  $emulatorDataPath = Join-Path $projectRoot '.emulator-data'
  $arguments = @(
    'emulators:start',
    '--project', 'demo-pirate-auth',
    '--only', 'auth,firestore,hosting',
    "--export-on-exit=$emulatorDataPath"
  )
  if (Test-Path -LiteralPath (Join-Path $emulatorDataPath 'firebase-export-metadata.json')) {
    $arguments += "--import=$emulatorDataPath"
  }
  & firebase.cmd @arguments
}
exit $LASTEXITCODE
