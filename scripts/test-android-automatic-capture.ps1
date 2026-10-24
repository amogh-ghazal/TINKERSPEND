param([Parameter(Mandatory=$true)][string]$Serial, [string]$Adb="$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe")
$ErrorActionPreference='Stop'
$app='in.tinkercraft.tinkerspend'
function Invoke-Adb {
    $r=& $Adb -s $Serial @args 2>&1
    if($LASTEXITCODE-ne0){throw "$r"}
    $r -join "`n"
}
if(((Invoke-Adb emu avd name)-split "`n")[0].Trim()-ne'TinkerSpend_Codex_API36'){throw 'Dedicated test AVD required'}
function State {
    Invoke-Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app | Out-Null
    ((Invoke-Adb logcat -d -s TSDebug:I '*:S')-split "`n" | Where-Object {$_-match 'state install='} | Select-Object -Last 1)
}
function Pending { $s=State; if($s-notmatch 'pending=(\d+)'){throw 'No diagnostic state'}; [int]$Matches[1] }
Invoke-Adb shell am start -n "$app.fixture/.PostActivity" --ez clear true | Out-Null
Invoke-Adb shell cmd notification disallow_listener "$app/.capture.PaymentNotificationListener" | Out-Null
Start-Sleep -Seconds 2
Invoke-Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app --es owner synthetic-automatic-owner --ez automatic true --ez enabled true --ez clear_packages true | Out-Null
if((Pending)-ne0){throw 'Use a fresh synthetic automatic owner'}
$stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Invoke-Adb shell "am start -n $app.fixture/.PostActivity --ei id 9301 --el when $stamp --es title SYNTHETIC --es text 'Paid INR 321.00 to Synthetic Auto Store. UPI Ref No 812345678901'" | Out-Null
Start-Sleep -Seconds 2
if((Pending)-ne0){throw 'Captured without notification access'}
Invoke-Adb shell cmd notification allow_listener "$app/.capture.PaymentNotificationListener" | Out-Null
$deadline=(Get-Date).AddSeconds(20)
do {Start-Sleep -Seconds 1; $count=Pending} while($count-ne1-and(Get-Date)-lt$deadline)
if($count-ne1){throw 'Existing visible payment was not imported on access grant'}
'PASS: granting access imports an already-visible payment with no selected packages and no MainActivity.'
$stamp2=$stamp+1
Invoke-Adb shell "am start -n $app.fixture/.PostActivity --ei id 9302 --el when $stamp2 --es title SYNTHETIC --es text 'Paid INR 450.00 to Synthetic New Store. UPI Ref No 812345678902'" | Out-Null
Start-Sleep -Seconds 2
if((Pending)-ne2){throw 'New payment not captured in automatic mode'}
Invoke-Adb shell "am start -n $app.fixture/.PostActivity --ei id 9302 --el when $stamp2 --es title SYNTHETIC --es text 'Paid INR 450.00 to Synthetic New Store. UPI Ref No 812345678902'" | Out-Null
Start-Sleep -Seconds 2
if((Pending)-ne2){throw 'Repeated callback duplicated automatic capture'}
State
'PASS: subsequent new notification captured and repeated callback collapsed. selected=[]; supported sources require no individual setup.'
