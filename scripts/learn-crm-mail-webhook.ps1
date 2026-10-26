# One-time Make webhook schema learning. Sends TEST_ONLY metadata; no actual mail
# while the Make scenario is INACTIVE/learning. Never paste the webhook URL in chat.
$ErrorActionPreference="Stop"
Write-Host "Make scenario 8135270 must be in learning mode and inactive."
$secure=Read-Host "Paste die Make Webhook URL (Eingabe ausgeblendet)" -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $hook=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim()
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if($hook -notmatch '^https://hook[.]eu1[.]make[.]com/[A-Za-z0-9]+$'){
  throw "Nur eine echte Make Webhook URL aus eu1 ist erlaubt."
}
$payload=[ordered]@{
  eventId="test_only_"+[guid]::NewGuid().ToString("N")
  kind="internal_new"
  to="lars@lszh-automations.ch"
  subject="[TEST_ONLY] LSZH CRM V2 Mail-Schema"
  html="<p>TEST_ONLY: Nur zum Erlernen der Webhook-Datenstruktur. Nicht versenden.</p>"
}
$body=$payload | ConvertTo-Json -Compress
try{
  $res=Invoke-WebRequest -Method POST -Uri $hook -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
  Write-Host "PASS: Teststruktur an Make uebertragen. HTTP $([int]$res.StatusCode)."
  Write-Host "Keine CRM- oder Kundendaten uebermittelt; Make-Szenario bleibt inaktiv."
}catch{
  Write-Error "Webhook-Lerntest fehlgeschlagen: $($_.Exception.Message)"
  exit 1
}
