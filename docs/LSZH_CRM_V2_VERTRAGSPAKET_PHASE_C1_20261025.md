# LSZH CRM V2 – Phase C.1: gesicherte Vertragsversand-Freigabe und transaktionales Ledger (STAGING)

**Stand:** 25.10.2026. **Branch:** `feature/crm-v2-contract-release-ledger-staging-20261025`, abgezweigt vom bestätigten B-Staging. **Keine Produktiv-Deployments, keine echten Mail-Sends, keine Firestore-Schreibaktion, kein Eingriff in Make 8144117/8162162.**

## B-Abnahme als Ausgangspunkt

- Betreiber: **187/187** CRM-/Offerten-/PDF-/Make-/PowerShell-Tests bestanden; lokaler 423-Parser-Selbsttest PASS.
- Make: Zwei-PDF- und AVV-Drei-PDF-Webhooks in Szenario **8162162** verarbeitet. Drei-PDF-Run `8ec49aa96eeb48458b6e5c04b283af4e`: 3 Iterator-Bundles `offer` 3717 B, `terms` 3717 B, `avv` 3713 B; Aggregator mit drei Eingaben erfolgreich, HTTP 423 Sperrantwort verifiziert. Volles Aggregator-Output-PDF wurde in den Make-Diagnosedaten gekürzt.
- Szenario **8162162 inaktiv**, 0 Gmail-Verbindungen. Bestehender produktiver einzelner Offerten-PDF-Sender **8144117** bleibt unverändert.

## Neue isolierte Module

### 1. `crm-v2/contract-dispatch-release-staging.js`

- `createContractReleaseGate(config).approve(pkg,request)`: erlaubt ausschliesslich **synthetische TEST_ONLY-Vertragspakete** mit genau 2 Dokumenten (`offer`, `terms`) oder 3 (`offer`, `terms`, `avv`). Die aus Phase A bekannte explizite AVV-Klassifizierung bleibt verpflichtend; `review` ist gesperrt.
- Prüfung: unveränderte Paketidentität/-revision, **exakte Testempfänger-Allowlist** statt Domain-Wildcards, genehmigter Operator, bewusster `purpose=TEST_ONLY_CONTRACT_DISPATCH`, eindeutige Freigabe-ID, frische Freigabe (höchstens 15 Minuten) und von einem **vertrauenswürdigen Backend** positiv verifizierter Operatorentscheid über `authorizeOperator(...)`.
- PDF-Originalbytes kommen ausschliesslich aus dem serverseitig injizierten `readArchivedPdf`, werden auf PDF-Signatur, Länge und SHA-256 gegen die Dokumentversionen geprüft. Kein Rückgriff auf vom Browser gelieferte `verified=true`-Flags. Der Code verweigert echte Vertragsdokumente, Testdateien ohne `TEST_ONLY`, unbekannte Felder und nicht erlaubte Empfänger.
- Der auf diese Weise geprüfte Dokument-/Freigabe-Metadatensatz wird serverseitig durch HMAC-SHA-256 mit einem **mindestens 32 Byte langen Backend-Geheimnis** versiegelt (`signature`). **Kein Token, PDF-Base64, HTML oder Kundenmail-Inhalt** wird in das Übergabeobjekt kopiert.
- Sicherheitsgrenze: Der signingSecret, die Operator-Authentifizierung, die tatsächlichen Archiv-Bytes, die Testempfänger-Allowlist und der Zeitgeber müssen später vom autorisierten Backend kommen. Eine aus einem Browser-Request übernommene `authorizeOperator`-Antwort oder ein öffentlich erreichbares Signing-Key wäre unsicher. **Keine produktive Freigabe anhand dieses isolierten Moduls.**

### 2. `crm-v2/contract-dispatch-ledger-staging.js`

- `createContractDispatchLedger(db,config)` modelliert eine **Firestore-Transaktions-Schnittstelle** zu einer gesonderten Collection `lszh_crm_v2_contract_dispatch_staging_v1`; die **live benutzte CRM-Collection wird nicht referenziert**.
- `reserve(manifest)` prüft HMAC-Signatur und Ablauf, liest innerhalb **einer** Firestore-Transaktion zwei Dokumente und erzeugt **atomar** ein `attempt_<sha256(eventId)>` und einen **dauerhaften per-Offerte-Lock** `lock_<sha256(offerId)>`. Bei doppelter Event-ID, parallelem Reservieren oder alternativer Revision derselben Offerte ist der nächste Versandversuch gesperrt.
- Persistiert werden ausschliesslich Testpaketidentität, Empfänger-/Operator-/Freigabemetadaten, Dokumentnamen/Versionen/Byte-Längen/SHA-256 und Status. **Keine PDF-Bytes, Webhook-URLs, Signing-Keys oder Mail-HTML**. Pro-offer-Lock wird bei unklarer Zustellung oder `not_sent_closed` **nicht automatisch gelöscht**.
- Zustände: `reserved` → `delivery_review` (unklarer Versand; **nie automatisch wiederholen**); `reserved`/`delivery_review` → `confirmed_test_only` nur nach **vertrauenswürdig verifiziertem echtem Gmail-Receipt** (`eventId`, Paket-SHA, exakter Testempfänger, Dokumentanzahl und Message-ID). Abschluss unklarer Fälle als `not_sent_closed` ausschliesslich nach unabhängig geprüfter manueller Mailbox-Review; der Sperr-Lock bleibt erhalten.
- Provider-/Mailbox-Verifier werden **ausserhalb der retrierbaren Firestore-Transaktion** aufgerufen; innerhalb der Transaktion werden die zuvor geprüften Paketreferenzen/Zustände nochmals verglichen. `inspect(eventId)` zeigt lediglich ungefährliche Statusmetadaten.
- Wichtig: `confirmed_test_only` ist **nie** CRM `Versendet`, Kundenannahme, LSZH-Auftragsbestätigung oder Vertragsgültigkeit. Ein Gmail-Sende- oder -Verifikationsmodul ist **noch nicht** verbunden. Es gibt **keine** Recovery-Funktion, die ohne manuelle Freigabe erneut sendet.

## Tests und CI

- `crm-v2/test/contract-dispatch-phase-c.test.js`: **14 neue Node-Testfälle** für 2/3 Dokumente, Fristen/Operator/Allowlist, fehlende/veränderte PDF-Originalbytes, unautorisierte Testfreigaben, HMAC-Tampering, die Firestore-style atomare Doppelsperre, parallele Aufträge, Dauerlock über Neustart, korrelierte Gmail-Receipts, Manipulationen, manuelle Reconciliation und den Nichtimport in produktive CRM-Routen.
- Die Tests benutzen einen **FakeDb mit seriell simulierten Firestore-Transaktionen**, **keine echten Firestore-Prozesse oder Emulator**. Damit sind API-Form und grundlegende Fachlogik prüfbar; echte gleichzeitige Firestore-Transaktionen, IAM-Zugriff, Revision- und Crash-Verhalten müssen in einem separaten Firestore-Emulator-/0%-Service-Test geprüft werden.
- `.github/workflows/crm-v2-search-ci.yml`: um neuen Feature-Branch und Syntaxchecks der 3 neuen JS-Dateien erweitert. V8-Parsing der neuen Dateien **PASS**; **vollständiger echter Node-Lauf aus diesem Branch noch nicht bestätigt**. Der frühere Basissatz hatte 187 Tests; **erwartet 201 Tests** (187 + 14).

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-contract-release-ledger-staging-20261025
npm.cmd test --prefix .\crm-v2
```

## Vor Phase C.2 / echtem Versand notwendig

1. Echte Firestore-Emulator-/transaktionale Integrationstests einschliesslich paralleler Worker, Prozessneustart, Lock-Status und Crash-/Responseverlust – keine echten Kundendaten.
2. Server-seitig geprüfte Identität/Operatorfreigabe und getrenntes Testpostfach; echte Drive-Archiv-Originalversionen erst nach entsprechender Freigabe; Secret Manager/IAM restriktiv.
3. Ein **separater, manuell freizugebender** TEST_ONLY-Sendeweg für 2/3 Anhänge; positiver Provider-Receipt aus Gmail muss **unabhängig** verifiziert werden. Bestehendes Make 8144117 nicht für diese Versuche umbauen. Vor dem ersten realen Testversand benötigt es eine ausdrückliche Freigabe des Betreibers für die **konkrete Testadresse**.
4. Projektbedingungen RC1, AVV RC1/Anlagen A–C und die spezifische AVV-Einstufung **rechtlich und inhaltlich** abschliessend freigeben, bevor echte Kundenunterlagen versendet oder verbindlich angenommen werden.

**Status:** C.1 ist als isoliertes, nicht verbundenes Codegerüst mit Validatoren und Tests implementiert. Ein produktiver Vertragsversand wurde weder gebaut noch aktiviert. Externe E-Mails, Zahlungen und CRM-Schreiboperationen wurden nicht ausgeführt.
