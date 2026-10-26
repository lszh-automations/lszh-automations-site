# Farben der Website-Leads

Die Eingangsampel misst die Zeit zwischen Eingang und erster Bearbeitung. Nur der Status **Neu** altert weiterhin: unter 8 Stunden grün, ab 8 Stunden orange, ab 16 Stunden rot.

Beim ersten Wechsel aus Neu speichert der Server `urgencyFrozenAt`. Die dabei erreichte Farbe bleibt danach erhalten, auch bei Kontaktiert → Qualifiziert → Gewonnen/Verloren, weiteren Kontaktnotizen, automatischer Aktualisierung und erneutem Laden. Der sichtbare Alterstext zählt weiterhin die tatsächliche Zeit seit Eingang. Die zugängliche Beschriftung unterscheidet die Farbe bei Bearbeitungsbeginn.

Abgedeckte Wege: manueller Statuswechsel, direkt qualifiziert erfasster Lead, erfolgreicher Kontakt mit automatischem Wechsel auf Kontaktiert sowie Gewinn/Verlust aus einer Offerte. Ein erfolgloser Kontakt lässt einen neuen Lead weiterhin neu; seine Ampel läuft weiter. Das Zeitfeld ist kein beschreibbares Client-Feld und wird nach dem ersten Speichern nicht überschrieben.

## Bestehende Leads

Für bearbeitete Datensätze ohne gespeicherten Statuswechselzeitpunkt wird zuerst der älteste dokumentierte erfolgreiche Kontakt verwendet, ersatzweise der bisherige Bearbeitungszeitpunkt und zuletzt der Eingang. Die ursprüngliche Farbe lässt sich ohne damaligen Statuswechselzeitpunkt nicht immer exakt rekonstruieren. Beim nächsten normalen Bearbeiten wird dieser verfügbare Bezug konserviert, damit weitere Änderungen ihn nicht verschieben. Das Lesen allein verändert keine Daten; keine Massenmigration oder Nachdatierung wird ausgeführt.

## Prüfung

481 CRM-Tests erfolgreich. Neue Fälle prüfen erfolglose und erfolgreiche Kontakte, direkte Qualifikation, spätere Statuswechsel, weitere Kontakte, ignorierten Manipulationsversuch des Server-Feldes und historischen Rückfall. UI-Zeittest: Nach weiteren 24 Stunden wird ein neuer Lead rot; ein bereits kontaktierter grüner und ein qualifizierter oranger Lead bleiben unverändert. Dasselbe auf Desktop und Mobil nach erneutem Rendern geprüft; reales Netzwerk blockiert. Keine Kundenmail und keine Produktionsdatensätze durch die Releaseprüfung verändert.

[PR 26](https://github.com/lszh-automations/lszh-automations-site/pull/26). Live-Nachweis im zugehörigen Release-Manifest.

## Live-Nachweis

Seit 26.10.2026: `lszh-crm-v2-00103-joy`, 100 % Verkehr. [Release-Manifest](../releases/lead-colours-live-20261026.json). Alle 79 gebauten Dateien bestätigt; nur `cloud-records.js`, `lead-contact.js` und `public/index.html` gegenüber dem vorigen Release geändert. GitHub-Staging- und Baselineprüfung inklusive Firestore-Emulatortests erfolgreich. Oberfläche HTTP 200, Leads anonym HTTP 401, keine Fehler der neuen Revision im geprüften Zeitfenster. Konfiguration und Dienstkonto unverändert; keine Produktionsdatensätze oder Mails bearbeitet, Portal und Make unverändert. Rückfall: `lszh-crm-v2-00101-caf`.
