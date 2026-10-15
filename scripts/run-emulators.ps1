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
  & firebase.cmd emulators:exec --project demo-pirate-auth --only auth,firestore 'npm.cmd test'
} else {
  & firebase.cmd emulators:start --project demo-pirate-auth --only auth,firestore,hosting
}
exit $LASTEXITCODE
