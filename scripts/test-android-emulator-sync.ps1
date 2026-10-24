param(
    [Parameter(Mandatory = $true)][string]$Serial,
    [string]$Adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
)
$ErrorActionPreference='Stop'
$app='in.tinkercraft.tinkerspend'
function Adb {
    $r=& $adb -s $serial @args 2>&1
    if($LASTEXITCODE -ne 0){throw "$r"}
    $r -join "`n"
}
if (((Adb emu avd name) -split "`n")[0].Trim() -ne 'TinkerSpend_Codex_API36') { throw 'Wrong AVD' }
$base='http://127.0.0.1:8787/api/v1'
$health=Invoke-RestMethod "$base/health"
if ($health.env -ne 'test') { throw 'Local APP_ENV=test backend required' }
Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app | Out-Null
$state=((Adb logcat -d -s TSDebug:I '*:S') -split "`n" | Where-Object {$_ -match 'state install='} | Select-Object -Last 1)
if($state -notmatch 'install=([a-f0-9-]+)'){throw 'No native install ID'}
$install=$Matches[1]
$ch=Invoke-RestMethod "$base/auth/challenge" -Method Post -ContentType application/json -Body (@{client='android';install_id=$install}|ConvertTo-Json -Compress)
$claims=@{iss='https://accounts.google.com';aud='e2e-client.apps.googleusercontent.com';exp=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+600;sub="synthetic-avd-sync-$([Guid]::NewGuid())";email='owner@e2e.test';email_verified=$true;nonce=$ch.nonce}
$idToken=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($claims|ConvertTo-Json -Compress))).TrimEnd('=').Replace('+','-').Replace('/','_')
$login=Invoke-RestMethod "$base/auth/google" -Method Post -ContentType application/json -Body (@{client='android';challenge_id=$ch.challenge_id;id_token=$idToken;install_id=$install;device_label='SYNTHETIC Codex AVD'}|ConvertTo-Json -Compress)
# This is a disposable local test session, never a Google token or owner credential.
Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app --es owner $login.user.id --es token $login.token --ez automatic true --ez enabled true | Out-Null
$stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$ref='612345678902'
Adb shell "am start -n $app.fixture/.PostActivity --ei id 8201 --el when $stamp --es title SYNTHETIC --es text 'Payment of Rs.700 to Metro Mart is pending using HDFC Bank. UPI Ref No $ref'" | Out-Null
$headers=@{Authorization="Bearer $($login.token)";'X-Client'='android'}
$deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
do {
    Start-Sleep -Seconds 2
    $pendingLedger=Invoke-RestMethod "$base/transactions" -Headers $headers
    $pendingItems=@($pendingLedger.items)
} while (($pendingItems.Count -ne 1 -or $pendingItems[0].payment_status -ne 'pending') -and [DateTimeOffset]::UtcNow -lt $deadline)
if($pendingItems.Count -ne 1 -or $pendingItems[0].payment_status -ne 'pending'){throw 'Pending notification was not visible in local D1'}
$transactionId=$pendingItems[0].id
'Observed one pending INR 700 transaction before posting the success update.'
Adb shell "am start -n $app.fixture/.PostActivity --ei id 8201 --el when $($stamp+1) --es title SYNTHETIC --es text 'Rs.700 paid to Metro Mart successful using HDFC Bank. UPI Ref No $ref'" | Out-Null
Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app --ez sync true | Out-Null
$deadline=[DateTimeOffset]::UtcNow.AddSeconds(60)
do {
    Start-Sleep -Seconds 2
    $ledger=Invoke-RestMethod "$base/transactions" -Headers $headers
    $transactions=@($ledger.items)
} while (($transactions.Count -ne 1 -or $transactions[0].payment_status -ne 'successful') -and [DateTimeOffset]::UtcNow -lt $deadline)
if($transactions.Count -ne 1 -or $transactions[0].id -ne $transactionId -or $transactions[0].amount_paise -ne 70000 -or $transactions[0].payment_status -ne 'successful' -or $transactions[0].source -ne 'notification' -or $transactions[0].reported_bank -ne 'HDFC Bank' -or $transactions[0].notification_posted_at -ne $stamp){throw "Unexpected ledger: $($ledger|ConvertTo-Json -Depth 8 -Compress)"}
Adb shell am broadcast -a "$app.DEBUG_CONFIG" -p $app | Out-Null
$state=((Adb logcat -d -s TSDebug:I '*:S') -split "`n" | Where-Object {$_ -match 'state install='} | Select-Object -Last 1)
$state
if($state -notmatch 'pending=0 failed=0'){throw 'Outbox was not fully acknowledged'}
$transactions | Select-Object amount,amount_paise,payment_status,source,counterparty,review_state,reported_bank,notification_posted_at | ConvertTo-Json -Compress
'PASS: native WorkManager -> local Worker/D1; pending -> successful upgrades one INR 700 transaction. Synthetic source and local fake identity only.'
