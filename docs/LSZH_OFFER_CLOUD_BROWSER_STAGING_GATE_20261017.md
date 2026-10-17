# LSZH Automations – Cloud-Browser-Staging (Freigabegate, 17.10.2026)

**Zweck:** Einen einmaligen, echten Browser→Google-Cloud-Run→Google-Drive/Firestore-Test mit **rein fiktiven** Angeboten durchführen, ohne bestehende Kunden, `main`, Render oder die interne Cloud-Run-Revision anzufassen. Dieses Dokument ist **kein Deployment-Auftrag**.

## Gesicherter Ist-Zustand

- Bestehender Dienst: `lszh-offer-portal-staging` in `lszh-automations/europe-west6`.
- `100 %` Traffic auf **`lszh-offer-portal-staging-00004-qt7`** (read-only Preflight, Function Target `lszhPortalPreflight`).
- `ingress=internal`; direkte Service-Policy `bindings=null` (Projekt-/Organisationsberechtigungen nicht abgeklärt).
- Runtime-Dienstkonto: `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`.
- Noch **kein** Deployment des hier entwickelten kompletten Portals; reale Vertragsannahmen/Mails weiterhin blockiert.
- Read-only-Baseline-Checker: `python3 scripts/offer-cloud-readiness-readonly.py`. Führt nur `gcloud run services describe` und `gcloud run services get-iam-policy` aus. Gibt keine Credentials oder IAM-Personendaten aus. Die Offline-Negativfälle laufen in CI.

## Wichtig: Der vorhandene interne Dienst ist kein Browser-Testzugang

Google dokumentiert, dass `gcloud run services proxy` zwar einen privaten IAM-Dienst authentifiziert, jedoch **keinen internen Netzwerk-Ingress aus einem externen Rechner überwindet**. Ein Browserzugriff von ausserhalb des VPC auf die bestehende Adresse würde also nicht allein durch ein ID-Token funktionieren.

**Empfohlener Weg:** Für die *zeitlich begrenzte* Browser-Abnahme einmalig einen **separaten, IAM-geschützten Testdienst** aufsetzen, danach wieder entfernen. Den vorhandenen internen read-only Dienst niemals auf `ingress=all` stellen oder dessen Traffic umschalten. Das ist eine temporäre Testressource, keine neue dauerhafte Produktionsarchitektur.

## Voraussetzung vor irgendeiner Cloud-Schreibaktion (NO-GO bis Freigabe)

1. **Betriebliche Freigabe:** Betreiber genehmigt ausdrücklich neuen temporären Cloud-Run-Testdienst, ein dediziertes minimales Dienstkonto, die möglichen Cloud-Kosten, die notwendige IAM-/Ingress-Konfiguration, einzelne fiktive Staging-Dokumente und deren spätere Bereinigung.
2. **Separater Name und Identität:** Geplanter temporärer Dienstname `lszh-offer-browser-staging`, nicht `lszh-offer-portal-staging`. **Getrenntes Dienstkonto** mit ausschliesslich notwendigem Lesezugriff auf die benannte Staging-Firestore-DB und den freigegebenen ausschliesslich fiktiven Google-Drive-Testordner. Keine Berechtigung für reale Kundenarchive oder Firestore-Schreibzugriffe.
3. **Identitätsgeschützter Webzugang:** Nur der temporäre Dienst darf `ingress=all` nutzen, **mit aktivierter Cloud-Run-IAM-Invoker-Prüfung**; nur explizit autorisierter Testbenutzer als Invoker, kein `allUsers`/`allAuthenticatedUsers` und kein deaktivierter IAM-Check. Lokal den offiziellen `gcloud run services proxy` verwenden, soweit der Rechner den Dienst erreicht.
4. **Aktuell vorhandene Code-Bremse:** `stagingConfig.mjs` und `startupIdentityCheck()` lassen bewusst nur den bisherigen Servicenamen und dessen Dienstkonto zu. Ein eigener Testdienst braucht vor dem Deployment eine **separat geprüfte exakte Allowlist für Name, Dienstkonto und neue HTTPS-Origin**, nicht die Entfernung der Sicherheitschecks. Die tatsächliche Service-URL wird erst nach Erstellung bekannt; initiale Revision muss daher deaktiviert starten.
5. **Fiktive Daten sind noch nicht cloud-fertig:** Der synthetische Airtable→Firestore-Importer kann **absichtlich nur in einen lokalen Firestore-Emulator schreiben**. Vor dem Cloudtest muss eine sichere, einzeln autorisierte Testdatensatz-Anlage mit Quell-/Owner-Markierung, eindeutigem Tokenhash, echten *fiktiven* archivierten PDF-Hashes und gezielter Löschung entwickelt und geprüft werden. Kein Seed aus echten Kunden. Keine Freigabe, wenn die PDFs nur in einem privaten statt freigegebenen Geschäftsstaging-Ordner liegen.
6. **Nur Vorschau und PDFs:** Der tatsächliche Cloud-Entrypoint bleibt zwingend `syntheticOnly:true`, `acceptEnabled:false` und `downstream.*=disabled`. Keine Annahme, Bestätigungsmail, Annahmebeleg, Make-Aktion oder Airtable-Statusänderung.
7. **Abnahmekriterien:** Browser lädt die geschützte Offertenseite, zwei bzw. drei PDFs sind per Hash und Archivzugehörigkeit verifiziert, AVV-Nein verhindert dritten Download, ungültiger Link/Origin blockiert, `POST /api/offer/accept` gibt `503 not_available`; alle Tests mit `example.invalid`, `TEST_*_NO_CONTRACT`.
8. **Cleanup & Kosten:** Exakt den temporären Dienst und seine *eigenen* Testdateien/-daten/gegebenenfalls Rechte entfernen; keine bestehende Revision, andere Datenbank-Collection oder produktive Berechtigung löschen. Danach den ursprünglichen 100-%-Traffic-/Ingress-Zustand mittels read-only Checker erneut bestätigen.

**Nicht tun:** Alte Revision ersetzen, 0-%-Tag als angeblich öffentlich erreichbaren Browserzugang verkaufen, bestehendes Archiv öffentlich schalten, unautorisierte Cloud-Logs/Token exportieren, `--allow-unauthenticated` wählen oder die bisherigen Sicherheitsprüfungen aus Bequemlichkeit entfernen.

## Technischer Stand im Entwicklungsbranch

- Echte Chromium-Tests nutzen vorhandenen Browser-HTML-/PDF-/Portal-HTTP-Code, testen explizit den künftigen **read-only Cloud-Preview-Modus** mit AVV Ja/Nein und blockierter Annahme.
- Eine Offertenvorschau enthält nur ausdrücklich zugelassene Anzeigefelder, keine willkürlichen Firestore-Details oder internen Notizen.
- `scripts/offer-cloud-readiness-readonly.py --self-test` prüft die wichtigsten Negativfälle ohne Google-Cloud-Zugriff.
- Erst nach den obigen Genehmigungen und Tests darf ein separater temporärer Browser-Testservice geschaffen werden.

**Offizielle Grundlagen:**
- https://docs.cloud.google.com/run/docs/securing/ingress
- https://docs.cloud.google.com/sdk/gcloud/reference/run/services/proxy
- https://docs.cloud.google.com/run/docs/authenticating/developers
