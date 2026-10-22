# Isolierte öffentliche TEST_ONLY-Vorschau – Release 21.10.2026

Ziel: realen HTTPS-Aufruf eines Fragmentlinks und zwei PDF-Downloads intern prüfen. Keine Annahme, Kundendaten oder Mail; abgeschlossene V3-Offerte nicht wiederverwenden.

## Konkretes Paket

Neuer separater Cloud-Run-Dienst lszh-offer-link-preview in lszh-automations/europe-west6, bestehende temporäre Dienstidentität lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com. Eigener Dockerfile.public-test-preview, keine npm-/SDK-Abhängigkeiten. Nur native Node-Laufzeit, vorhandener Portal-Kern/HTTP-Adapter, bestehende Webseite und deterministische fiktive PDF-Fixtures. Kein Firestore, Drive, Airtable, Gmail oder Make. Keine Daten- oder IAM-Rollengrants. Öffentlich aufrufbare Seite, tokengebundene Vorschau/PDF-POSTs, keine Archive oder fremden Records.

Öffentliche Cloud-Run-Aufrufbarkeit gilt ausschliesslich für den neuen Vorschaudienst (invokerIamDisabled=true, ingress all); bestehende Kunden-/Staging-Dienste unverändert. Maximal eine Instanz, null Mindestinstanzen, 256 MiB, CPU nur bei Requests, 15 Sekunden Requestlimit. Cloud Build und kurze Cloud-Run-Laufzeit können geringe Kosten verursachen.

Zufälliger HMAC-abgeleiteter Code ausschliesslich im Operator-Arbeitsspeicher und Browserfragment, im Dienst nur SHA-256. Keine Code-Ausgabe, Datei oder Mail. Feste fiktive Quelle rec12345678901235 ist keine CRM-Anlage; number TEST_PDF_AVV_NEIN_NO_CONTRACT, Empfänger synthetic@example.invalid. Beide PDFs sind neue technische Fixtures, keine Geschäftsarchivnachweise. Keine Behauptung von Drive-Archivierung oder WORM.

Konfiguration pinnt Dienst/Projekt/HTTPS-Origin, Hashformat und feste Ablaufzeit maximal zwei Stunden; Operator setzt 30 Minuten. Ablauf sperrt alle HTTP-Pfade, auch beim Neustart. Annahme immer HTTP 503; Claim-Funktion hat keinen Schreibpfad. Falscher Token und AVV-Download HTTP 404, fremde Origin HTTP 403.

## Operator und Rückbau

scripts/public-test-preview-operator.mjs: --build mit unveränderlicher Commit-SHA, --deploy mit derselben SHA erst nach erfolgreichem Image-Digest, --check für positive/negative Live-Prüfung, --open für Browseröffnung ohne Code-Ausgabe, --cleanup ausschliesslich für exakt benannten/doppelt gelabelten Vorschaudienst mit ETag. Existierender Dienst wird beim Deploy nicht überschrieben. Service-Zustand wird nur bereinigt ausgelesen, keine komplette Umgebung oder Providerfehler ausgegeben. Lokale .public-preview-state.json enthält nur Build-/Digest-/Zeit-/Ergebnisdaten, keine Bearer oder Zugangsdaten. Nach internem Browsercheck Dienst entfernen und bestehende Kundenroute erneut HTTP 503 bestätigen. Buildimage als technischer Nachweis behalten, keine Scheduler.

## Verifikation vor Cloud-Schreibzugriff

309 Node-Tests: 303 bestanden, 6 übersprungen, 0 Fehler. Neuer Test prüft echte HTTP-Fixture mit PDF-Bytehashes, falschem Token, falscher Origin, fehlender AVV, Annahmesperre und Ablaufgrenze. Echter Chromium-Test gegen neue reine In-Memory-Vorschau bestanden, zwei PDFs heruntergeladen, Fragment aus Historie entfernt und kein Code in GET-URLs. Operator-Syntax geprüft. Kein Docker-Build oder Live-Preview aus diesen lokalen Ergebnissen behauptet.

Cloud-Basis lesend geprüft: bisheriger Browser-Staging-Dienst 100 Prozent auf 00006-h5w; Kundendienst unverändert auf 00005-f2k. Keine weiteren Basis-/V3-Tests wiederholen.

API-Grundlagen: https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services/create und https://docs.cloud.google.com/build/docs/api/reference/rest/v1/projects.builds .


## Live-Abschluss

Build 5eaba22f-c168-420a-ac0e-acfd0e5bbf2b aus Commit 3ae7128ffebf6b96f462c489955717593b1267be erfolgreich. Image-Digest sha256:45ebe7cc02e3879cccc7ab5fe4dce7ce1e5d86c666b5e4bf00e165c7f36dafe0. Separaten Dienst erstellt; kein bestehender Dienst aktualisiert. Zugang war bis 21.10.2026 16:35:36.465 UTC (18:35:36 Schweizer Zeit) begrenzt und wurde vor Ablauf durch Rückbau ungültig.

PUBLIC_PREVIEW_LIVE_PASS: öffentliche HTTPS-Seite HTTP 200 und no-store, richtige fiktive Vorschau/test_only=true/test_accept_enabled=false, zwei PDF-Downloads mit tatsächlichem SHA-256-Abgleich, falscher Code HTTP 404, fremde Origin HTTP 403, AVV-Download HTTP 404, Annahme HTTP 503. Kein POST konnte einen Vertrag annehmen; kein Datenbank- oder Provider-Schreibpfad vorhanden. Link direkt im Betreiberbrowser geöffnet, ohne Codeausgabe. Betreiber bestätigt: **Ja, beide PDFs öffnen; Annahme deaktiviert**.

Anschliessend temporären Dienst anhand festem Namen, Zweck-/Temporary-Labels und ETag entfernt; Cloud-Run-Delete-Operation erfolgreich: PUBLIC_TEST_PREVIEW_REMOVED. Bestandsdienste erneut gelesen: Browser-Staging weiterhin 100 Prozent auf 00006-h5w, neueste bereite Revision unverändert 00010-lars; Kundenportal neueste bereite Revision weiterhin 00005-f2k. Öffentliche Kundenroute weiterhin HTTP 503. Kein Make-Szenario verändert/gestartet, keine Mail, keine neuen IAM-Rollen oder Secrets, keine Firestore-/Airtable-Anlage und keine V3-Wiederholung.

**Nachweisgrenze:** Dies ist die Abnahme eines öffentlichen, codegeschützten Vorschau-/PDF-Pfads mit synthetischen, gebündelten Dokumenten. Kein geschäftlicher Archivzugriff, kein Echtkundenvertrag, keine öffentliche Annahme, kein vollständiger Offertenmail- oder Kunden-Onboarding-Nachweis. Vor echter Kundenannahme fehlen weiterhin kundenbezogene finale Unterlagen, tatsächliche Quellfreigaben und ausdrückliche Pilotfreigabe. Nicht erneut denselben Test starten.
