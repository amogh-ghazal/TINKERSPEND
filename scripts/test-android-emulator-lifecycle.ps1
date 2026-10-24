param(
    [Parameter(Mandatory = $true)][string]$Serial,
    [string]$Adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
)
$ErrorActionPreference='Stop'
$app='in.tinkercraft.tinkerspend'
function Adb {
    $r=& $adb -s $Serial @args 2>&1
    if($LASTEXITCODE -ne 0){throw "$r"}
    $r -join "`n"
}
if (((Adb emu avd name) -split "`n")[0].Trim() -ne 'TinkerSpend_Codex_API36') { throw 'Wrong AVD' }
function State {
    Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app | Out-Null
    ((Adb logcat -d -s TSDebug:I '*:S') -split "`n" | Where-Object {$_ -match 'state install='} | Select-Object -Last 1)
}
function Pending { $s=State; if($s -notmatch 'pending=(\d+)'){throw 'No state'}; [int]$Matches[1] }
function Post([int]$id) {
    $stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    Adb shell "am start -n $app.fixture/.PostActivity --ei id $id --el when $stamp --es title SYNTHETIC --es text 'Paid INR 20.00 to Synthetic Lifecycle Market.'" | Out-Null
    Start-Sleep -Seconds 3
}
$activities=Adb shell dumpsys activity activities
$mainCount=@($activities -split "`n" | Where-Object {$_ -match 'in.tinkercraft.tinkerspend/\.MainActivity'}).Count
"MainActivity task entries before lifecycle tests: $mainCount"
if($mainCount -ne 0){throw 'UI had already been opened'}
$before=Pending
$processId=(Adb shell pidof $app).Trim()
if($processId -notmatch '^\d+$'){throw 'Expected exactly one target process'}
Adb shell run-as $app kill -9 $processId | Out-Null
Start-Sleep -Seconds 3
Post 9101
if((Pending) -ne ($before+1)){throw 'Capture after process death failed'}
'PASS: process killed; system restarted native listener; new synthetic payment captured.'
Adb shell cmd notification disallow_listener "$app/.capture.PaymentNotificationListener" | Out-Null
Start-Sleep -Seconds 2
$before=Pending
Post 9102
if((Pending) -ne $before){throw 'Captured while access revoked'}
Adb shell cmd notification allow_listener "$app/.capture.PaymentNotificationListener" | Out-Null
Start-Sleep -Seconds 3
$before=Pending
Post 9103
if((Pending) -ne ($before+1)){throw 'Capture after regrant failed'}
'PASS: revoked notification access prevents capture; regrant restores capture.'
$before=Pending
Adb reboot | Out-Null
$deadline=(Get-Date).AddSeconds(60)
do {
    Start-Sleep -Seconds 3
    $boot=& $adb -s $Serial shell getprop sys.boot_completed 2>$null
    if($boot -eq '1'){break}
} while((Get-Date)-lt $deadline)
if($boot -ne '1'){throw 'Reboot not ready within 60 seconds'}
Adb shell wm dismiss-keyguard | Out-Null
Start-Sleep -Seconds 3
if((Pending) -ne $before){throw 'Queued outbox count changed across reboot'}
Post 9104
if((Pending) -ne ($before+1)){throw 'Capture after reboot failed'}
State
'PASS: encrypted pending outbox survives reboot; new payment captured without opening MainActivity.'
