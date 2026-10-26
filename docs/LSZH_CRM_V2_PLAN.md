> Historischer Entwicklungsplan vom 22.10.2026. Für den heutigen Produktivstatus gilt [Produktionsrelease 26.10.2026](LSZH_PRODUCTION_RELEASE_20261026.md).

# LSZH Automations CRM V2 – verbindlicher schlanker Aufbau

Status: **Entwicklungsgrundlage**, noch kein Produktivbetrieb. Stand: 22.10.2026.

## Geschäftliches Ziel

Ein einfaches internes CRM für LSZH Automations, das ausschliesslich diese fünf Register anbietet:

1. **Website Leads** – Anfrage, Problembeschreibung, Kontaktdaten, freiwillige Geschäftsadresse und Qualifizierung.
2. **Kunden** – Stammdaten eines Unternehmens, Ansprechpartner, Geschäftsadresse, Status.
3. **Offerten** – Leistungsbeschreibung, einmaliger/monatlicher Preis, Status, fortlaufende eindeutige Nummer ab 1000.
4. **Rechnungen** – Rechnungsentwurf, Betrag, Fälligkeit und Status.
5. **Projekte** – Umsetzung, Termin, Kunde und Verknüpfung zur angenommenen Offerte.

**Kein sechstes Register** ohne konkreten geschäftlichen Bedarf. Die Website bleibt bestehen und wird lediglich um Adressfelder ergänzt. Keine Neubearbeitung der bestehenden öffentlichen Gestaltung.

## Architektur

- **Eigene CRM-Webanwendung:** Verzeichnis crm-v2, separater Node.js-Server auf eigenem Cloud-Run-Dienst.
- **Authentifizierung:** Google Identity Services (Google-ID-Token), serverseitig mit dem freigegebenen OAuth-Client verifiziert. Zugang nur für Adressen in CRM_ALLOWED_EMAILS, kein offener Registrierungsprozess. Tokens werden nur im Browser-Arbeitsspeicher gehalten.
- **Datenbank:** Google Cloud Firestore mit dedizierten Collections mit Präfix lszh_crm_v2_, Zugriff ausschliesslich aus dem CRM-Server über ein zweckgebundenes Cloud-Run-Dienstkonto. Kein Firestore-Zugriff direkt aus dem Browser.
- **Backend:** GET/POST/PATCH über /api/records/{leads,kunden,offerten,rechnungen,projekte}; kein Löschen, kein E-Mail-Versand, keine automatische Rechnungsausstellung.
- **Nummernvergabe:** serverseitige Firestore-Transaktion mit Sequenzzähler. Offerten beginnen bei 1000, unabhängig von bereits in Airtable vorhandenen Testofferten. Beim späteren Umstieg Bestandsnummern und Dopplungen prüfen.
- **Bestehende Systeme:** Make bleibt für externe Kundensysteme und Übergangs-Automationen. Bestehende Cloud-Run-Vertrags-/PDF-Dienste werden erst nach geprüfter Schnittstellenintegration wiederverwendet.
- **Bestehende Website:** weiterhin public Render/Website; Hauptformular sendet an /api/lead -> Make -> bestehendes Airtable. Nichts am produktiven Routing automatisch ändern.
- **Isolation:** /crm-v2/ wird vom öffentlichen Website-Server nicht ausgeliefert; CRM wird ausschliesslich aus crm-v2/ als separates Projekt bereitgestellt.

## Feldmapping Adresse

Neue Website-Formularfelder (alle freiwillig, um die Zahl der Erstkontakte nicht unnötig zu reduzieren):

| Website-Feld | CRM-Feld | Vorhandenes Airtable-Feld |
| --- | --- | --- |
| street | street | Strasse |
| postal_code | postalCode | PLZ |
| city | city | Ort |
| country | country | Land |

Das Website-Formular stellt diese Angaben beim Absenden als JSON bereit. **Wichtig: Das bisherige aktive Make-Eingangsszenario 7774243 übernimmt diese vier Felder noch nicht in seinen Airtable-Datensatz.** Vor Aktivierung der Website-Adressänderung muss entweder das bestehende Mapping angepasst oder der sichere V2-Lead-Ingest implementiert werden; sonst sind zwar Eingaben möglich, ihre Speicherung im CRM jedoch nicht gewährleistet. Änderungen am aktiven Make-Szenario nur im kontrollierten Cutover.

## Statusübergänge (zunächst manuell im CRM)

- Website Leads: Neu -> In Prüfung -> Qualifiziert / Verloren.
- Kunden: Aktiv / Inaktiv.
- Offerten: Entwurf -> Bereit -> Versendet -> Angenommen / Abgelehnt.
- Rechnungen: Entwurf -> Offen -> Bezahlt / Storniert.
- Projekte: Geplant -> In Arbeit / Wartet auf Kunde -> Abgeschlossen.

Eine Offerte auf Angenommen stellen **löst aktuell noch keine automatische Projektanlage aus**. Das ist später eine explizit zu implementierende und zu testende serverseitige Aktion. Dasselbe gilt für den sicheren PDF- und Vertragsprozess, die Zahlungsverifikation und den Rechnungsversand.

## Stufen und Abnahmekriterien

### Stufe 1 – CRM-Grundlage (dieser Branch)
- [x] Fünf Register ohne unnötige Zusatztabellen.
- [x] Formular für Geschäftsadresse im Website-Code vorbereitet.
- [x] CRUD-Grundlagen (Listen, Erstellen, Bearbeiten) für fünf Register.
- [x] Google-ID-Token-/E-Mail-Allowlist-Schutz und serverseitiger Datenzugriff.
- [x] Sequenznummern in Firestore-Transaktion vorbereitet.
- [x] Kein Deploy, keine Echtdatenmigration, keine aktiven Automationen verändert.
- [ ] Ausführungstest nach Installation der Node-Dependencies.
- [ ] Google-OAuth-Client, Cloud-Run-Dienstkonto und Firestore-Berechtigungen eingerichtet.
- [ ] Staging-Dienst bereitstellen; Anmeldung und Datenoperationen end-to-end testen.
- [ ] Rechteprüfung (unberechtigter Nutzer, fehlender/abgelaufener Token, Schreibversuch).
- [ ] Website-Adressfelder end-to-end inkl. dauerhaftem Speichern testen.

### Stufe 2 – Ein echter Prozess
- [ ] Website-Formular -> V2-Lead mit Wiederholungsschutz; Airtable bleibt bis Cutover führend.
- [ ] Qualifizierter Lead -> Kunde / Offerte ohne doppelte Dateneingabe.
- [ ] Offertenentwurf -> vorhandene PDF-Ausgabe -> freigegebener Versand -> verifizierte digitale Annahme.
- [ ] Annahme -> Projekt + Kunden-Onboarding (nur exakt einmal, sicher bei Wiederholungen).
- [ ] Rechnungs-PDF und Swiss-QR-Rechnung nach definierter Freigabe.
- [ ] Pro Schritt nachvollziehbares Fehlerverhalten, minimale Logs ohne ungeschützte Kundendaten.

### Stufe 3 – Umstieg
- [ ] Vorhandene Airtable-Daten inventarisieren; welche tatsächlichen Stammdaten/Verknüpfungen übernehmen wir?
- [ ] Revisionssichere Offerten-/Vertragsnachweise und bisherige Rechnungsnummern bewahren.
- [ ] Sicheres Backup und Migrations-Test mit Prüfsummen/Stichproben.
- [ ] Website-Prozess auf V2 umstellen; Make-Doppellieferungen verhindern.
- [ ] Alten Ablauf erst nach erfolgreichem End-to-End-Test deaktivieren.
- [ ] Keine Alt-Bases löschen, bevor Migration und Archivierung abgenommen sind.

## Hinweise zum lokalen Start

Im Verzeichnis crm-v2:

    npm install
    npm run check
    npm start

Erforderliche Umgebungsvariablen:

- GOOGLE_OAUTH_CLIENT_ID: freigegebene Google-OAuth-Webclient-ID. Der öffentliche Ursprung des CRM muss in der OAuth-Konfiguration autorisiert sein.
- CRM_ALLOWED_EMAILS: kommagetrennte Liste berechtigter interner Google-E-Mail-Adressen.
- GOOGLE_CLOUD_PROJECT: gewünschtes, separat freigegebenes Google-Cloud-Projekt.
- PORT: optional, standardmässig 8080.

Für die Google-Cloud-Authentifizierung lokal ADC verwenden, auf Cloud Run ein dediziertes Dienstkonto mit minimal notwendigen Firestore-Berechtigungen (nicht den privaten Google Drive-Zugang und keine API-Schlüssel in Dateien). Ohne korrektes OAuth-/Firestore-Setup ist das CRM **absichtlich nicht einsatzbereit**. Bei externer Erreichbarkeit muss der Server trotz öffentlicher Login-Seite alle Datenzugriffe serverseitig autorisieren.

## Nicht Bestandteil dieser ersten Grundlage

PDF-Erzeugung, Vertragsannahme, AVV, Make-Kunden-Onboarding, Mailversand, Swiss-QR-Rechnung, Zahlungsverbuchung, Rollen für mehrere Mitarbeitende, automatischer Import und ein kundenoffenes Portal. Diese bestehenden Funktionen werden nicht entfernt; ihre Integration wird nachgelagert geprüft. Keine produktiven Kundenmails oder Rechnungen ohne ausdrückliche Freigabe.
