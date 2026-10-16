# LSZH Onboarding – serverseitige Vorgangsbestätigung (Entwicklungsstand 16.10.2026)

**Umfang:** Nur die **technische Verarbeitung der Kunden-Onboarding-Eingabe**, ausdrücklich **nicht** der Abschluss des Kundenprojekts, kein Nachweis einer überprüften Make-Einladung, keiner juristischen Freigabe oder versandten Bestätigungsmail.

**Branch:** `feature/onboarding-server-confirmation-20261016` (aus `fix/onboarding-response-contract-20261016`). Nicht deployt; `main`, Render-Live und Make-Szenario `7777695` bleiben unverändert. Kundenmail-Modul 9 bleibt durch `0=1` gesperrt.

## Sicherheitsentscheidung

Der HTTP-Erfolg des Make-Webhooks, die Queue-Antwort `Accepted` und ein Airtable-Record-ID-Beleg **allein** genügen nicht, um den vollständigen technischen Abschluss zu behaupten. Die Website prüft serverseitig den **tatsächlichen Datenstand**. Dafür wird ein dedizierter Airtable-PAT mit **ausschliesslich `data.records:read`** auf die Website-CRM-Base `appzJiskpAdaR1HEv` beschränkt. Er gehört ausschliesslich in die Staging-Secret-Konfiguration (`AIRTABLE_ONBOARDING_READ_TOKEN`); kein Klartext in Chat, GitHub oder Airtable. Ohne Konfiguration bleibt die Nachprüfung aus und liefert HTTP 503 statt falscher Erfolgsmeldung.

Der Server prüft in dieser Reihenfolge:
1. Höchstens **einen** Onboarding-Datensatz mit exakt passendem `Projektcode` und zulässigem Status.
2. Reziproke Verknüpfung zu dem Auftrag sowie dessen Onboarding-Token (keine fremde Zuordnung).
3. Am Auftrag gespeicherte Make-Angaben und die erwarteten technisch vorgenommenen Setzungen.
4. Die vom Kunden im Onboarding erfassten Rechnungsdaten im Kundenstamm (einschliesslich leerer optionaler Werte).
5. Bei `Sensible Daten = Ja/Unsicher`: genau **eine** Datenschutz-Prüfaufgabe mit Code `<Auftrag-ID>-DSG-01` und richtiger Auftragsverknüpfung. Ob die Prüfung **inhaltlich freigegeben** wurde, wird dadurch nicht behauptet.

Es gibt **keine** Airtable- oder Make-Schreiboperation in diesem Prüfpfad. Kurzzeitige HTTP-/Airtable-Ausfälle geben **keinen** positiven Status zurück. Der Projektcode bleibt ein geheimes, nicht erratbares Link-Token; der Status wird ausschliesslich über POST im JSON-Body angefragt und niemals in URL-Queryparametern, Antwortdaten oder Logs ausgegeben. Normale Sicherheitsfilter des Website-Servers (Same-Origin, Rate Limit, `no-store`) gelten weiterhin.

## Antwortvertrag

`POST /api/onboarding/status` mit Body `{"project_code":"ob_<UUID>"}`:

| HTTP | Status | Bedeutung |
| --- | --- | --- |
| 200 | `{"ok":true,"state":"completed","confirmed":true,"verified":true}` | Technische Eingabeverarbeitung nachweislich abgeschlossen |
| 202 | `{"ok":true,"state":"processing","pending":true}` | Noch nicht vollständig nachgewiesen |
| 409 | `{"ok":false,"state":"requires_review"}` | Doppelte oder widersprüchliche Persistenz, manuelle Klärung |
| 400 | `invalid_project_link` | Ungültiger Token |
| 502 | `status_unavailable` | Airtable/API-Fehler: **kein** Nachweis |
| 503 | `status_not_configured` | Read-only-Dienst noch nicht eingerichtet |

`POST /api/onboarding` wertet weiterhin das Make-Ergebnis aus, bestätigt aber selbst bei plausibler `record_id` nur, wenn derselbe Datensatz serverseitig erneut geprüft wurde. Sonst HTTP 202. Bei `already_submitted` weiterhin 409. Das Frontend fragt nach unklarer Antwort **bis zu viermal** nur den Read-only-Status ab (1,5 / 3 / 5 / 8 Sekunden); **niemals** das Kundeneingabe-POST automatisch wiederholen. Wird ein Abschluss bestätigt, wird ausdrücklich zwischen *verarbeiteter Eingabe* und *Projektabschluss* unterschieden.

## Teststand

- Synthetische, netzwerklose Regressionstests `onboarding/confirmation.test.mjs`: Zuordnung, Duplikate, Datenfehler, Rechnungsspiegel, DSG-Aufgabe, API-Ausfall, ungültige Tokens.
- Formular-Regression `onboarding/response-contract.test.mjs`: `Accepted` != Abschluss; 202 != Abschluss; später verifizierter Abschluss; Konflikt; Timeout; niemals Doppel-POST.
- GitHub Actions `.github/workflows/onboarding-confirmation.yml`: `node --check server.js`, `node --test onboarding/*.test.mjs`. Kein Schlüssel, keine E-Mail, kein Deployment.
- **Noch kein echter Cloud-/Render-HTTP-Lauf und keine Prüfung gegen ein produktives Airtable-PAT.** Auch noch keine Zusage, dass E-Mails nach Schliessen der Website zuverlässig versandt werden; dafür ist eine gesonderte dauerhafte Benachrichtigungs-Queue nötig.

## Abnahmeschritte – offen

1. Feature-Branch/CI und Code prüfen, nicht ungeprüft in `main` mergen.
2. Ausschliesslich auf isoliertem Staging ein dediziertes lesendes Airtable-PAT hinterlegen (keine Schreibberechtigung; Freigabe durch Geschäftsführer).
3. Mit `TEST_ONLY`-Aufträgen tatsächliche HTTP-Antworten und Nachverifikation der Datensätze beweisen: pending, erfolgreich, Datenlücke, DSG-Fehler, Duplikat, Airtable-Ausfall.
4. Falls Kunden später auch **nach dem Schliessen der Seite** informiert werden sollen: separate persistente Notification-Outbox mit eindeutigem Vorgangs-/Ereignisschlüssel, überprüfter Provider-Zustellung, Wiederaufnahme und manueller Reconciliation unklarer Sendungen erstellen. Kein Versand ohne explizite Freigabe. Transportzustellung ist nicht gleich gelesen.
5. Erst danach produktive Konfiguration und weitere Rechts-/Geschäftsfreigaben separat entscheiden.

*Entscheidung: fail-closed, minimaler Datenzugriff, keine Aktivierung externer Kommunikation.*
