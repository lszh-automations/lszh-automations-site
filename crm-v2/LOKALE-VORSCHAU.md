# LSZH CRM V2 – Lokale Testversion

Diese Vorschau bietet **dieselbe Oberfläche mit fünf Registern** wie das CRM V2, speichert aber **ausschliesslich lokale Beispieldaten**. Kein Google-Login, keine Firestore-Zugangsdaten, kein Make, kein Render. Die produktive Website und das echte CRM bleiben unverändert.

## Start auf Windows Surface (PowerShell)

Aus dem bereits vorhandenen Repository-Verzeichnis:

```powershell
cd C:\Users\larss\Projects\lszh-automations-site
git fetch origin
git switch --track origin/feature/crm-local-preview-20261023
cd crm-v2
node local-preview.js
```

Öffne im Browser **http://127.0.0.1:8765/**. Die Vorschau läuft nur auf `127.0.0.1` (diesem Gerät) und benötigt keine npm-Installation und keine Cloud-Zugangsdaten, solange Node.js installiert ist. PowerShell offen lassen; beenden mit `Strg + C`.

Alternativ aus `crm-v2`: `npm.cmd run preview`. `npm.cmd test` testet das eigene CRM-Leadschema und die lokale Vorschau.

## Daten

- Automatisch erzeugte Beispiele: 2 fiktive Website-Leads, 1 Kunde, 1 Offerte (Nr. 1000), 1 Rechnung (RE-1000), 1 Projekt.
- Neue Offerten/Rechnungen erhalten in der Testversion fortlaufende Nummern ab 1001.
- Neue und bearbeitete Testdaten werden unter `crm-v2/.local-preview/data.json` gespeichert. Der Ordner ist in `.gitignore` ausgeschlossen.
- Die Daten bleiben nach Schliessen und Neustart erhalten. Zum Zurücksetzen: Prozess stoppen und **nur** den Ordner `crm-v2/.local-preview` löschen. Beim nächsten Start werden die fiktiven Beispiele neu erzeugt.
- Testdaten **nicht** mit realen Kundeninformationen verwechseln oder mit ihnen ersetzen: Die lokale Datei ist nicht verschlüsselt und die Testversion besitzt keine Anmeldung.

## Was hier noch nicht funktioniert

- Kein Abruf produktiver Website-Anfragen und kein Firestore-Sync.
- Keine echten E-Mails, QR-Rechnungen, Vertragsannahmen, PDF-Erzeugung oder Make-Szenarien.
- Keine Mehrbenutzer-Funktion und keine Netzwerkfreigabe – dies ist eine lokale Entwicklungs-/Designvorschau, **nicht** das vollständige produktive CRM.
- Für das echte CRM mit produktiven Daten bleibt der Google-Cloud-Backend-Dienst mit gesicherter Authentifizierung der richtige Weg.

## Sicherheit & Technik

`local-preview.js` nutzt nur eingebaute Node.js-Module. Er bindet ausschliesslich an `127.0.0.1:8765`, liefert die vorhandene `public/index.html` mit einem lokal eingeschalteten Demo-Modus und einer deutlich sichtbaren Warnleiste aus. Er stellt getrennte `/api/records`-Routen für Testdaten bereit. Änderungen sind nur im lokalen JSON-Speicher; die produktiven Cloud-Dienste werden nicht angesprochen.

Die Änderungen in diesem Branch betreffen nur `crm-v2/` und werden **nicht** mit dem produktiven Render-Webdienst verbunden.
