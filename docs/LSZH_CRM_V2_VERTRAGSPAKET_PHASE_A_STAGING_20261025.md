# LSZH CRM V2 – Vertragspaket Phase A (isoliertes Staging)

**Stand: 25.10.2026.** Technischer Domain-Prototyp, **nicht deployed, nicht in CRM-Routen eingebunden, keine Mail/Vertragsannahme aktiviert.** Arbeitsbranch `feature/crm-v2-offer-contract-package-staging-20261025` basiert auf `feature/crm-v2-read-performance-20261024`.

## Ziel und vorhandene Schnittstelle

Das produktive CRM versendet bewusst und nur nach manuellem CRM-Klick eine einzelne Offerten-PDF über Make/Gmail (aktives Szenario 8144117). Der neue Baustein `crm-v2/offer-contract-package.js` definiert unabhängig davon das künftige **versionierte Vertragsdokumentpaket** und dessen **rein funktionale Zustandsübergänge**. `crm-v2/offer-send.js`, `server.js`, `cloud-records.js`, `public/index.html` und Make bleiben in dieser Phase **unverändert**.

## 1. Eingabeschema und Paketvertrag

Die pure Funktion `prepareOfferPackage(input)` erwartet exakt:

```js
{
  offerId: 'offer_test_1',                 // Firestore CRM Offerten-ID
  offerNumber: '1000',                    // bestehende Offertennummer
  revision: 1,                            // Paketversion der Offerte
  offerSnapshotSha256: '<64 hex chars>',  // muss spaeter serverseitig aus den gespeicherten Offertendaten ermittelt werden
  avvRequired: 'no',                    // 'yes' | 'no' | 'review' (review sperrt)
  avvAnnexesConfirmed: false,           // yes => true, no => false
  documents: [
    { kind: 'offer', version: 'RC1_TEST_ONLY', archiveFileId: 'test_archive_offer_20261025',
      sha256: '<64 hex chars>', filename: 'TEST_ONLY_offer.pdf', bytes: 500 },
    { kind: 'terms', version: 'RC1_TEST_ONLY', archiveFileId: 'test_archive_terms_20261025',
      sha256: '<64 hex chars>', filename: 'TEST_ONLY_terms.pdf', bytes: 600 }
  ]
}
```

Bei `avvRequired: 'yes'` sind **drei unterschiedliche** PDF-Metadatensätze `offer` / `terms` / `avv` sowie `avvAnnexesConfirmed: true` erforderlich. `review` oder fehlende AVV-Einstufung stoppt fail-closed; `no` erlaubt ausschliesslich `offer` und `terms`. Das Format prüft Länge/Zeichenvorrat, Dateinamen ohne Pfadseparator, erlaubte Typen, eindeutige Archiv-IDs und eindeutige SHA-256-Werte. Es nimmt **keine** externen Download-URLs, Bearer-Token, Kundenadressen oder zusätzliche Felder an.

Ergebnis: `schemaVersion:1`, deterministische `packageId` (`pkg_<offerId>_r<revision>`), `sendEventId` (`contract_send_pkg_<offerId>_r<revision>`), kanonisch geordnete und eingefrorene Dokumentmetadaten, `packageSha256` über den kanonischen JSON-Metadatensatz und `status:'prepared'`. `verifyOfferPackage(pkg)` prüft Schema, unveränderte Metadaten und Prüfsumme. Ein SHA-256-Hash ist **kein Ersatz für vertrauenswürdig bezogene Dokumentbytes**; dafür gibt es `verifyDocumentBytes(doc,buffer)` mit PDF-Signatur-, Längen- und SHA-256-Prüfung.

**Integritätshinweis:** `offerSnapshotSha256` und Archiv-IDs werden in Phase A **nur formal** geprüft. Vor späterem Einsatz müssen sie durch autorisierte CRM-/Archiv-Dienste aus tatsächlich gespeicherten Snapshot-/PDF-Bytes berechnet beziehungsweise gelesen werden. Der Paket-Hash allein ist keine digitale Signatur und keine Unveränderlichkeitsgarantie gegen einen privilegierten Schreiber.

## 2. Getrennte Zustände (keine automatische Rechtswirkung)

| Ausgangszustand | Ereignis | Zielzustand | Harte Bedingung |
|---|---|---|---|
| `prepared` | `reserve_manual_send` | `sending` | explizite interne Versandfreigabe |
| `sending` | `gmail_receipt_confirmed` | `sent` | verifizierter Provider-Receipt, **paketgebundene** Event-ID und Message-ID |
| `sending` | `delivery_uncertain` | `delivery_review` | kein automatischer Retry |
| `delivery_review` | `manual_delivery_verified` / `manual_not_sent_verified` | `sent` / `prepared` | dokumentierte manuelle Mailboxprüfung |
| `sent` | `record_customer_response` | `customer_response_recorded` | geprüftes Portal-Token, Vertretung, ausdrückliche Projektbedingungen-Zustimmung, vollständige Original-Dokumenthashes, bei AVV zusätzlich separate Zustimmung |
| `customer_response_recorded` | `approve_internal_review` | `awaiting_lszh_confirmation` | interne Prüfung/Freigabe |
| `awaiting_lszh_confirmation` | `record_written_confirmation` | `confirmed` | **nachweislich versandte schriftliche LSZH-Auftragsbestätigung** mit Message-ID und Hash |
| `sent` | `customer_declined` | `declined` | berechtigte Person |
| `prepared` | `cancel_before_send` | `cancelled` | manuelle interne Stornofreigabe |

**Vertragsrechtliche Trennung:** Das bestehende PDF und die Angebotsmail sind ausdrücklich unverbindlich und sehen eine schriftliche Auftragsbestätigung vor. `customer_response_recorded` ist **kein** CRM-Status `Angenommen` und keine Freigabe zur Kunden-/Projektanlage. Im künftigen Integrationscode darf die vorhandene Firestore-`win()`-Transaktion erst nach `confirmed` sowie nach tatsächlicher geschäftlicher/juristischer Freigabe genutzt werden. Technische Bestätigung im Prototyp ersetzt kein Rechtsgutachten.

`nextOfferPackageState(pkg,event,evidence)` verändert keinen bestehenden Datensatz und liefert nur eine neue Kopie des Zustandsträgers. Es **persistiert keine Ereignisse**, überprüft keine Google-Sitzungen und versendet keine Mails. Beweis-Flags wie `operatorApproved`, `portalTokenVerified` oder `providerReceiptVerified` müssen **ausschliesslich vom vertrauenswürdigen Backend** nach realer Authentifizierung/Verifikation gesetzt werden; niemals aus frei manipulierbarem Browser-JSON übernehmen.

## 3. Tests und Deployment-Sperre

Neue Testdatei: `crm-v2/test/offer-contract-package.test.js`, 12 Szenarien inkl. Zwei-/Drei-PDF-Pakete, AVV-Ja/Nein/Prüfen, doppelte/gefälschte Hashes, manipulierte IDs, Pfadangriffe, Byte-Integrität, Mail-Receipt-Korrelation, unklarer Versand ohne Autoretry, getrennte interne Prüfung und schriftliche LSZH-Bestätigung. Bestehende Tests unverändert.

CI-Workflow `.github/workflows/crm-v2-search-ci.yml` enthält den neuen isolierten Branch und führt `npm test --prefix crm-v2` sowie `node --check` des neuen Bausteins/Tests aus. **Ausführungsergebnis in diesem Hand-off noch nicht gesichert**; nicht als PASS ausgeben, bevor CI oder der Betreiber die Tests tatsächlich ausgeführt und bestätigt hat.

Operator (lokaler GitHub-Checkout, **nur Tests**, keine Cloud-/Make-Aktionen):

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-offer-contract-package-staging-20261025
npm.cmd test --prefix .\crm-v2
```

## 4. Offene Phase-B-Arbeiten (noch nicht freigegeben)

- Eine echte Firestore-Transaktion für den Paketsnapshot und die Revisionssperre bauen; parallele Versandfreigaben/idempotente Event-ID absichern.
- Die archivierten Geschäfts-Drive-Dokumente über ein **read-only-Dienstkonto** beziehen, tatsächlich byteweise SHA-256 und Dateityp prüfen; Geschäftskonto-Zuständigkeit und Berechtigungen belegen.
- Einen gesonderten **Staging-Mailpfad** für 2/3 PDF-Binäranhänge (mit `eventId` und bestätigtem `messageId`) testen. Bestehenden aktiven Einzel-PDF-Make-Pfad nicht mutieren.
- Sichere, einmalig nutzbare und ablaufende Annahmelinks inkl. ausdrücklicher Kundenhandlung, Vertretungsnachweis und optionaler AVV-Zustimmung an Firestore-Dokumentversionen binden; Recovery nach E-Mail-/Archivausfall.
- Vor externem Kundenbetrieb finale Projektbedingungen/AVV-Anlagen A–C, Dokumentenfreigabe, Datenschutz/AVV, rechtliche Prüfung und 0%-Staging-End-to-End-Test abnehmen. Kein Sendefreigabestatus und keine Online-Annahme automatisch setzen.

**Kurzstatus:** Phase-A-Implementierung in einem isolierten Branch erstellt; kein Live-Release, keine Änderungen an Make, Cloud Run, Firestore oder echten Kunden.
