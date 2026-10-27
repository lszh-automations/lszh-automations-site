# Kundenübersicht und automatische Zuordnung

Unter **Kunden → Öffnen** stehen die Kontaktdaten und direkt darunter alle zugeordneten Offerten, Rechnungen und Projekte. Jeder Eintrag lässt sich öffnen. Die drei Listen werden getrennt vom Server geladen und hängen nicht von den im Browser geladenen Registerseiten ab. Jeweils 50 Einträge werden geladen; bei weiteren Einträgen erscheint **Weitere laden**. Auch ältere Datensätze ohne Erstellungsdatum bleiben auffindbar. Ein Lesefehler kann pro Liste erneut versucht werden.

**+ Offerte**, **+ Rechnung** und **+ Projekt** starten einen neuen Entwurf mit bereits gewähltem Kunden. Über **Stammdaten bearbeiten** lassen sich die Kundendaten ändern; nach dem Speichern erscheint die aktualisierte Kundenübersicht. Beim Öffnen zugeordneter Einträge werden benötigte Verweise gezielt nachgeladen. Bereits gespeicherte Verknüpfungen bleiben auch dann im Formular erhalten, wenn sie nicht auf der aktuellen Registerseite stehen.

## Automatische Zuordnung

- Eine aus einem qualifizierten Lead erzeugte Offerte erhält den bestehenden Kunden, wenn exakt ein Kunde dieselbe E-Mail und dieselbe normalisierte Firma besitzt. Gross-/Kleinschreibung und zusätzliche Leerzeichen der Firma werden vereinheitlicht. Ein Firmenname allein genügt nicht.
- Ein neues Projekt übernimmt den Kunden aus der zugeordneten angenommenen Offerte, wenn kein Kunde ausdrücklich gewählt wurde. Widersprüchliche Kundenangaben werden abgewiesen.
- Eine neue Rechnung übernimmt entsprechend den Kunden des Projekts. Bereits aus der Auftragsannahme erzeugte Projekte und einmalige Rechnungsentwürfe behalten ihren bisherigen, gemeinsamen Kunden.
- Bei Auftragsübernahme wird ein bestehender Kunde ohne explizite Kundenauswahl ebenfalls nur über E-Mail und Firma wiederverwendet. Eine andere Firma wird nicht wegen derselben E-Mail dem bisherigen Kunden zugeschlagen. Mehrere Kunden mit derselben E-Mail erfordern eine eindeutige Kundenauswahl.

Eine Zuordnung erzeugt keinen Versand und verändert keine Preise, Vertragsunterlagen, Zahlungen oder Projektstände. Neue Entwürfe aus der Kundenübersicht werden weiterhin bewusst gespeichert.

## Historische Zuordnung

Die lesende Bestandsprüfung am 27.10.2026 ergab einen Kunden, acht Offerten, fünf Rechnungen und drei Projekte. Alle Rechnungen und Projekte sowie vier Offerten waren korrekt verknüpft; vier ältere versendete Offerten hatten keine Kunden-ID. Offerten **1000, 1002 und 1005** passen eindeutig über E-Mail und Firma. Offerte **1003** hat eine abweichende Firma und bleibt ohne Vermutung offen.

Die eng begrenzte Operator-Reparatur `scripts/crm-customer-relations-repair.cjs` akzeptiert nur ausdrücklich benannte Offerten. Ohne `--apply` wird ausschliesslich ein Zuordnungsplan geschrieben. Bei Anwendung wird die Übereinstimmung in derselben Firestore-Transaktion erneut geprüft; laufende oder ungeklärte Versandaufträge bleiben gesperrt. Bestehende Kunden-IDs werden nicht überschrieben. Nur die fehlende Kunden-ID und die üblichen Bearbeitungsangaben werden ergänzt. Ein Prüfsummenvergleich bestätigt, dass alle übrigen gespeicherten Angaben unverändert bleiben. Archivdateien und Versandnachweise werden nicht ersetzt.

## Zugriff und Prüfung

`GET /api/records/kunden/:id/related?table=offerten|rechnungen|projekte&cursor=...` erfordert den vorhandenen CRM-Zugang. Seitenzeiger müssen zu demselben Kunden und Register gehören. Der Endpunkt schreibt keine Daten und führt keine automatische Reparatur beim Öffnen aus.

493 CRM-Tests erfolgreich: seitenweise vollständige und ausschliessliche Zuordnung, alte Datensätze ohne Datum, widersprüchliche und mehrdeutige Kunden, Erhalt kommerzieller Angaben, wiederholte Reparatur, Anmeldung und GET-only-Endpunkt. Ein zusätzlicher Firestore-Emulatortest prüft den tatsächlichen REST-Reparaturpfad und mehr als zwei Seiten von Projekten ohne Erstellungsdatum. Desktop und Mobil wurden mit synthetischen Daten, blockiertem externem Netzwerk und simuliertem Speichern geprüft.


## Live-Nachweis

Aktiv seit 27.10.2026: **`lszh-crm-v2-00111-yaf`**, 100 % Verkehr. Alle 80 gebauten Laufzeitdateien exakt bestätigt; nur `cloud-records.js`, `public/index.html` und `server.js` geändert. Konfiguration und Dienstkonto unverändert. Beide GitHub-Prüfungen einschliesslich Firestore-Emulatortests erfolgreich. Oberfläche HTTP 200; die drei Kundenlisten sind anonym HTTP 401. Keine Fehlerlogs der neuen Revision im abschliessend kontrollierten Zeitfenster.

Die fehlende Kunden-ID wurde bei Offerten **1000, 1002 und 1005** ergänzt. Der Prüfsummenvergleich bestätigt alle übrigen Offertendaten als unverändert. Der lesende Abgleich ergibt beim bestehenden Kunden **7 Offerten, 5 Rechnungen und 3 Projekte**; sämtliche ergänzten Verknüpfungen sind sichtbar. Offerte **1003** bleibt wegen abweichender Firma unzugeordnet. Keine Kundenstammdaten, Archivdateien, Zahlungen, Rechnungsstände oder Versandnachweise geändert; keine Mail oder neue Rechnung. Website, Portal und Make unverändert.

[PR 31](https://github.com/lszh-automations/lszh-automations-site/pull/31) · [Live-Nachweis](../releases/customer-overview-live-20261027.json). Rückfallrevision: `lszh-crm-v2-00109-hiz`. Eine Rückkehr zur vorherigen Softwareversion entfernt die korrekten Kundenverknüpfungen nicht.
