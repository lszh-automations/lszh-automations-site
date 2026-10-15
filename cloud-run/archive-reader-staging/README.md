# LSZH Cloud Run – Archiv-Leseprobe (STAGING)

**Nur Testbetrieb.** Region `europe-west6` (Zürich), Projekt `lszh-automations`, Dienst `lszh-archive-reader-staging`.

## Cloud Run Inline-Editor

- Datei `index.js`: Inhalt von dieser Verzeichnisdatei kopieren und die Beispiel-Funktion vollständig ersetzen.
- **Funktionseinstiegspunkt** im oberen Cloud-Run-Editor von `helloHttp` auf **`archiveHealth`** umstellen.
- `package.json` kann im Standard-Node.js-22-Template unverändert bleiben, falls es `@google-cloud/functions-framework` als Dependency und ES-Module unterstützt. Sonst die mitgelieferte `package.json` verwenden.
- **Sicherheit**: IAM-Authentifizierung erzwungen, keine öffentlichen Aufrufberechtigungen; **Ingress: Intern** (kein externer Load Balancer), **Dienstkonto** `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`.
- **Skalierung** 0–1 Instanzen, anfragebasierte Abrechnung, keine Trigger, keine produktiven Secrets, Kundendaten oder Make-Aufrufe.
- Code prüft das Dienstkonto über die Google-Metadata-API, fragt einen kurzlebigen Google-Drive-Lese-Token an (Scope `drive.readonly`) und verifiziert **ausschliesslich ein vorab festgelegtes synthetisches AVV-PDF** anhand ID, Parent-Ordner, MIME, readOnly, Size, SHA-256 und echter PDF-Bytes.
- Code protokolliert bei Cloud-Run-Start **nur** `LSZH_ARCHIVE_READER_STAGING: PASS` / `FAIL` und legt keine Dokumente oder Credentials offen. Über den privaten IAM-Endpunkt ergibt eine erfolgreiche GET-Anfrage lediglich `{ok:true,synthetic:true}`. **Kein Endpoint mit beliebiger File-ID**, kein Upload, keine Annahme und keine E-Mail.
- Aufgrund `Ingress: Intern` kann ein externer Browser oder Cloud Shell nicht ohne weiteres eine URL-Testanfrage ausführen. Der Starttest wird daher über **Cloud Run → Observability → Logs** überprüft.
- Der Code wurde lokal auf Node Syntax und mit synthetisch gemockter Drive-/Metadata-API auf Erfolg sowie falsche Identität, fehlenden Schreibschutz, falschen Digest und unzulässige HTTP-Methoden getestet. **Noch nicht auf Google Cloud Run geladen/ausgeführt.**

## Offene Architekturentscheidung

Die produktive Render-Website kann den Cloud Run Dienst mit `Ingress: Intern` nicht direkt aufrufen. Ein späteres externes Aufrufverfahren braucht eine absichtlich geplante und eindeutig authentifizierte Verbindung (z.B. VPC-basierter Zugriff oder anderer vertrauenswürdiger Google-Cloud-Relay-Dienst), **nicht** bloss eine geheime URL. Bisher ist dies ein interner Test der schlüssellosen Google-Drive-Identität, nicht die endgültige Produktionsintegration.

**Sicherheits- und Freigabestand:** Kein Merge auf `main`, keine Änderungen an Live-Render/Make, keine Google-Dienstkonto-Schlüssel, keine juristische Freigabe behaupten. Das Google-Cloud-Abrechnungskonto wurde laut Nutzerscreenshot als kostenloser Test mit 250 CHF Guthaben aktiviert; für den Echtbetrieb die geschäftliche Rechnungsadresse getrennt prüfen.
