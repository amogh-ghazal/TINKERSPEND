param(
    [Parameter(Mandatory = $true)][string]$Serial,
    [string]$Adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
function Invoke-Adb {
    # A plain function avoids PowerShell interpreting adb's -w as -WarningAction.
    $result = & $Adb -s $Serial @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "ADB failed: $result" }
    return ($result -join "`n")
}
# This script installs tests and changes notification access. Never target a personal phone/VM.
$avd = Invoke-Adb emu avd name
if (($avd -split "`n")[0].Trim() -ne 'TinkerSpend_Codex_API36') {
    throw 'Only the dedicated TinkerSpend_Codex_API36 AVD is allowed.'
}
if ((Invoke-Adb shell getprop ro.kernel.qemu).Trim() -ne '1') { throw 'An emulator is required.' }
$app = 'in.tinkercraft.tinkerspend'
$fixture = "$app.fixture"
$listener = "$app/.capture.PaymentNotificationListener"
Invoke-Adb install -r "$repo/apps/client/android/app/build/outputs/apk/debug/app-debug.apk"
Invoke-Adb install -r "$repo/apps/client/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
Invoke-Adb install -r "$repo/apps/client/android/fixture/build/outputs/apk/debug/fixture-debug.apk"
$instrumentation = Invoke-Adb shell am instrument -w "$app.test/androidx.test.runner.AndroidJUnitRunner"
$instrumentation
if ($instrumentation -notmatch 'OK \(6 tests\)' -or $instrumentation -match 'FAILURES!!!|INSTRUMENTATION_FAILED') {
    throw 'Expected all six native instrumentation tests to pass.'
}
Invoke-Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app --es owner synthetic-emulator-owner --es packages $fixture --ez enabled true
Invoke-Adb shell cmd notification allow_listener $listener
Invoke-Adb shell pm grant $fixture android.permission.POST_NOTIFICATIONS
Start-Sleep -Seconds 3
function Get-State {
    Invoke-Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app | Out-Null
    $lines = Invoke-Adb logcat -d -s TSDebug:I '*:S'
    $state = ($lines -split "`n" | Where-Object { $_ -match 'state install=' } | Select-Object -Last 1)
    if (-not $state) { throw 'No native diagnostic state returned.' }
    return $state
}
function Get-Pending {
    $state = Get-State
    if ($state -notmatch 'pending=(\d+)') { throw "Missing pending count: $state" }
    return [int]$Matches[1]
}
function Post-Synthetic {
    param([int]$Id, [long]$When, [string]$Text)
    # Quote the remote shell argument, independently of PowerShell's native argument quoting.
    if ($Text.Contains("'")) { throw 'Synthetic text must not contain shell quotes.' }
    Invoke-Adb shell "am start -n $fixture/.PostActivity --ei id $Id --el when $When --es title SYNTHETIC --es text '$Text'" | Out-Null
    Start-Sleep -Seconds 2
}
$initial = Get-Pending
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Post-Synthetic 7101 $stamp 'Payment successful. Paid INR 123.45 to Synthetic Market.'
if ((Get-Pending) -ne ($initial + 1)) { throw 'Payment was not captured.' }
Post-Synthetic 7101 $stamp 'Payment successful. Paid INR 123.45 to Synthetic Market.'
if ((Get-Pending) -ne ($initial + 1)) { throw 'Repeated callback created a duplicate.' }
Post-Synthetic 7102 ($stamp + 1) 'OTP 123456 for payment INR 123.45. Do not share.'
Post-Synthetic 7103 ($stamp + 2) 'Get up to INR 500 cashback offer on payment.'
if ((Get-Pending) -ne ($initial + 1)) { throw 'OTP or promotion escaped the filter.' }
Get-State
'PASS: synthetic payment capture, repeat callback collapse, OTP/promotion filtering; no app UI launched by this script.'
'No real UPI, live OpenAI, Google sign-in or physical-device result is implied.'
