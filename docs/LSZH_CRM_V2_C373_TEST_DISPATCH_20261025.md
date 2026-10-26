# C3.7.3 – Isolierte Testversand-Steuerung

Stand: 25.10.2026. Lokaler Code, kein Cloud-Deployment und kein Mailversand.

## Festgelegter Test

Absender info@lszh-automations.ch; einziger Empfänger lars.schulthess@outlook.com; keine CC/BCC. Zwei synthetische PDF-Dokumente (Offerte, Bedingungen), optional eine dritte synthetische AVV. Keine echten Vertragsdokumente oder Kundenannahmen.

## Implementierung

`crm-v2/contract-test-dispatch-staging.js` verbindet die vorhandene signierte Operatorfreigabe und Originalbyte-Prüfung mit dem vorhandenen transaktionalen Versand-Ledger. Der dauerhaft reservierte Offerten-Lock verhindert Wiederholungen auch über Revisionen hinweg. Vor dem externen Aufruf wird der Zustand auf `delivery_review` gesetzt. Ein Timeout, verlorenes Ergebnis oder fehlender SENT-Nachweis bleibt in manueller Prüfung; kein automatischer zweiter Versand.

Die Steuerung verlangt eine getrennte Job-Identität `lszh-crm-c373-contract-send-test`, Task 0 von 1, Versuch 0, Projekt lszh-automations, expliziten Testversand-Schalter und deaktivierte Kundenmails. Dieser Job wurde nicht angelegt. Die bestehende C3.7.2-Read-only-Probe bleibt unverändert.

Der neue Transportdatensatz wird getrennt von der bisherigen gesperrten C3.2-Vorschau erzeugt. Die Vorschau und ihre HTTP-423-Sperre werden nicht verändert. Der tatsächliche Transport muss einen einzigen externen Request ohne Client-/Provider-Retries durchführen; die Steuerung ruft den injizierten Adapter einmal auf und kann dessen interne Implementierung nicht selbst garantieren.

Nur ein unabhängiger, vertrauenswürdiger SENT-Prüfadapter darf `true` liefern. Er muss From/To, CC/BCC, SENT-Label, Message-ID, Paket-/Event-Header sowie Anzahl, Namen, Byte-Längen und SHA-256 sämtlicher Anhänge prüfen. Das Ledger bestätigt erst danach `confirmed_test_only`.

## Tests und Grenzen

Neun neue Offline-Tests prüfen beide Dokumentzahlen, feste Adressen, parallele Aufrufe und Revisionswechsel, verlorene Antworten, abgewiesene SENT-Evidenz, fehlgeschlagene Bestätigungsspeicherung, fehlgeschlagenen Vorab-Lock, falsche Empfänger, abgelaufene Freigaben, beschädigte PDFs und Runtime-Sperren.

Die Tests verwenden eine In-Memory-Datenbank, synthetische PDF-Byte-Fixtures und einen simulierten Provider. Sie belegen keine reale Gmail-Übertragung, keine dauerhafte Cloud-Speicherung und keine produktiven IAM-Rechte.

## Noch vor einem echten Versand umzusetzen

1. Eigenen dauerhaften Test-Datenspeicher und minimale IAM-Rechte bereitstellen. Der vorhandene Ledger verwendet die Sammlung lszh_crm_v2_contract_dispatch_staging_v1; deren Cloud-Nutzung und Rechte sind noch nicht freigegeben oder geprüft. Keine Demo-Emulatorinstanz als dauerhaften Versandschutz verwenden.
2. Separaten Make-/Gmail-Testtransport hinter dem Lock anbinden, mit genau einer Sendemöglichkeit und deaktivierten automatischen Wiederholungen. Bestehendes produktives Make-Szenario 8144117 und inaktives 8166714 nicht verändern.
3. Vorhandenen Read-only-SENT-Verifier an den konkreten Testfall koppeln und die exakt freigegebene Absender-/Empfängerkombination gegen seine vertrauliche Konfiguration prüfen, ohne Secretwerte auszugeben.
4. Konkrete synthetische PDFs und Anzahl der Testmails zur ausdrücklichen Versandfreigabe vorlegen. Frische signierte Operatorfreigabe erst unmittelbar vor dem freigegebenen Lauf erstellen.

Die Steuerung ist nicht in produktive CRM-Routen importiert. Kein Dienst, keine Make-Verbindung, kein Secret und keine Kundendaten wurden geändert.
