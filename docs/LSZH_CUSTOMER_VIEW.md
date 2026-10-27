# Kompakte Kundenansicht

Stand: 27.10.2026

Beim Öffnen eines Kunden stehen Ansprechpartner, E-Mail und Adresse kompakt unter Firma/Kundennummer. Danach folgen Projekte, Rechnungen und Offerten. Aktive Einträge stehen im Vordergrund; pro Register ist die abgeschlossene Historie aufklappbar.

Projekte: laufende/geplante/wartende Projekte mit Status und bestehendem nächsten Schritt, überfällige zuerst. Abgeschlossene Projekte stehen unter „Abgeschlossene Projekte“.

Rechnungen: offene und teilbezahlte Rechnungen zeigen Gesamtbetrag, Restbetrag und bestehende Fälligkeitsampel. Entwürfe bleiben sichtbar, werden nicht als offene Forderung ausgegeben. Unklarer Versand wird hervorgehoben. Bezahlte/stornierte Rechnungen stehen aufklappbar darunter, mit neutraler Fälligkeitsanzeige.

Offerten: Entwürfe, versendete Angebote und noch nicht intern abgewickelte Online-Annahmen bleiben sichtbar. Einseitige Annahme erscheint orange mit „Deine Bestätigung fehlt“, bestätigte, noch nicht übernommene Aufträge mit „Auftrag übernehmen“. Erst tatsächlich übernommene oder abgelehnte Offerten stehen in der abgeschlossenen Historie. Ein älteres Datum allein versteckt keine offene Offerte.

Daten werden weiterhin über die bestehenden serverseitigen Kunden-ID-Abfragen mit je 50 Einträgen geladen. „Weitere laden“ bleibt vorhanden, auch wenn die bisherige Seite nur abgeschlossene Einträge enthält. Offene Einträge auf weiteren Seiten bleiben erreichbar. Keine Finanzsumme oder Vollständigkeit wird aus einer einzelnen Seite abgeleitet. Weitere Seiten ergänzen dedupliziert, sortieren aktive Einträge neu und erhalten den aufgeklappten Verlauf.

Öffnen lädt unverändert den konkreten Datensatz und prüft dessen Kunden-ID. Neu-Schaltflächen übernehmen wie bisher den Kunden. Keine automatische Zuordnung, Änderung, Buchung, Annahme, Übernahme oder Nachricht durch Öffnen. Offerte 1003 bleibt unzugeordnet.

Validierung: 494 CRM-Tests, Desktop/Mobilgerät mit künstlichen Daten und blockiertem Netzwerk. Geprüft: aktive/abgeschlossene Einträge, Restbetrag, Ampel/bezahlt neutral, beide Online-Annahmeschritte, weitere Seiten mit älterem offenem Eintrag, Dubletten, erhaltener Historienzustand, Öffnen per ID, Kundenvorbelegung, Ladefehler/Wiederholen, veraltete Antwort nach Kundenwechsel und sichtbare Fussaktionen. Keine schreibenden API-Aufrufe.
