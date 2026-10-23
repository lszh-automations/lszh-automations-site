# LSZH CRM V2 – one internal TEST_ONLY mail through Make + business Gmail.
# Intentionally sends no customer email or real CRM data.
# Never paste the secret webhook address into chat or commit it to GitHub.
$ErrorActionPreference = 'Stop'
Write-Host "LSZH CRM V2: interner TEST_ONLY Gmail-Test an lars@lszh-automations.ch"
Write-Host "Voraussetzung: Szenario 8135270 ist auf NUR internen Testversand beschraenkt."
$secure = Read-Host "Geheime Make-Webhook-URL eingeben (unsichtbar)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $webhook = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim()
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if ($webhook -notmatch '^https://hook[.]eu1[.]make[.]com/[A-Za-z0-9]+$') {
  throw "Keine gueltige Make-Webhook-URL aus eu1."
}
$eventId = "test_only_" + [Guid]::NewGuid().ToString("N")
$payload = @{
  eventId = $eventId
  kind = "internal_new"
  to = "lars@lszh-automations.ch"
  subject = "[TEST_ONLY] LSZH CRM V2 – Geschaeftliche Gmail Anbindung"
  html = "<p><strong>TEST_ONLY</strong> – Das ist eine interne Testmail von LSZH CRM V2. Es wurden keine echten Kundendaten uebertragen.</p>"
}
$bytes = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress))
try {
  $response = Invoke-WebRequest -Method POST -Uri $webhook -ContentType "application/json; charset=utf-8" -Body $bytes -UseBasicParsing -TimeoutSec 45
  $status = [int]$response.StatusCode
  $result = $null
  try {$result = $response.Content | ConvertFrom-Json} catch {}
  if ($status -ne 200 -or $result.ok -ne $true -or -not $result.messageId) {
    Write-Warning "Unbestaetigte Mailannahme: HTTP $status – Versand anhand Make-Ausfuehrungen pruefen, NICHT blind wiederholen."
    throw "Kein verifizierter Gmail-Versandnachweis aus Make-WebHookResponse."
  }
  Write-Host "PASS: Gmail-Send-Modul hat eine Nachricht-ID bestaetigt."
  Write-Host "Empfaenger: lars@lszh-automations.ch"
  Write-Host "Betreff: [TEST_ONLY] LSZH CRM V2"
  Write-Host "Event-ID: $eventId"
  Write-Host "Mail-Nachrichten-ID: $($result.messageId)"
} catch {
  Write-Warning "Der HTTP-Aufruf kann trotz Timeout eine Mail versendet haben. Bitte zuerst Make-Ausfuehrungen und Gmail-Postfach kontrollieren."
  throw
}
