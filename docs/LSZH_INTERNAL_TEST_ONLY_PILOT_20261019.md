# Interner TEST_ONLY-Pilot mit Betreiber-Daten

Stand: 19.10.2026, Europe/Zurich. **Teilweise ausgeführt, kein vollständiger E2E-PASS.**

## Auftrag und Grenzen

Lars Schulthess hat einen ausdrücklich nicht rechtsverbindlichen internen Pilot mit eigenen Daten von LSZH Invest GmbH und der privaten Outlook-Testadresse autorisiert. Variante AVV Nein. Keine echte Kundenfreigabe, kein Vertragsabschluss, keine allgemeine Make-Aktivierung, kein Main-Merge. Die AVV-Rahmenvorlage ohne Anlagen A/B/C bleibt für echte AVV-Ja-Abschlüsse ungeeignet. Produktivannahme bleibt `LSZH_PORTAL_PRODUCTION_ENABLED=false`.

## Tatsächlich ausgeführt und rückgeprüft

| Schritt | Ergebnis / Nachweis |
| --- | --- |
| Test-Lead | Neu: `recP27RfNgnJzLM75`, Lars Schulthess, LSZH Invest GmbH, Outlook-Adresse. TEST_ONLY-Markierung, kein Gewonnen-Status. |
| Test-Offerte | Neu: `recR70ZSPynGqA1LS`, `TEST_INTERNAL_LARS_20261019_NO_CONTRACT`, Entwurf, CHF 0/0, gültig bis 21.10.2026, AVV Nein. |
| Sperren | Rechtliche Freigabe, Echtbetrieb und Versandfreigabe bleiben false/leer. `Übernommen=true` wurde nur am neuen Testrecord vorsorglich gesetzt, damit später keine Kunden-/Auftragsübernahme ausgelöst wird; es wurde kein Kunde/Auftrag erzeugt. |
| Offerten-PDF | Bestehendes Szenario `7835460` einmalig auf genau den neuen Testrecord begrenzt. Lauf `148988da42e04204a743d85ec50dce6b`, **9/9 Module ohne Fehler**. Offertenmail blieb deaktiviert. |
| Archiv | Neue TEST_ONLY-PDF `1KyemTuv8-Thf9Ir8kH4DX1x1dw33IS0y`, SHA-256 `614da4b5a3b44fc2b24217dbf433b9c1ef2815c34ca87a38b9217cbf2df47f2b`, im bestehenden direkten Geschäfts-Testordner `10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko`. Drive-SHA, Parent und readOnly im Make-Lauf geprüft und Referenz in Airtable unabhängig zurückgelesen. |
| Bedingungen | Bestehende synthetische `TEST_v1.0_RC1`-PDF verwendet; keine erneute allgemeine Drive-Diagnose. |
| Firestore | Neuer Einmal-Token nur als Hash in Airtable; neuer Test-Offer und Quellenindex **atomar create-only** in `lszh-offers-staging` angelegt. Anschliessender unabhängiger Firestore-GET PASS. Noch **keine Annahme**. |
| Private Betreiberdatei | Einladung liegt nur in `$HOME/.lszh-internal-test-pilot-20261019.json` in der bisherigen Cloud Shell. Inhalt nicht ausgeben, kopieren oder in Logs/Chat/GitHub speichern. |
| Code | Gesondertes internes Profil, zusätzliche opt-in Runtime-Sperre, genau eine Record-ID, feste autorisierte Outlook-Adresse und TEST_ONLY-Firmen-/Offertenmarkierung. Bestehende Kundenroute wird dadurch nicht freigeschaltet. **34/34 gezielte Tests PASS.** |
| CI | Nach Korrektur der fehlenden gemeinsamen Moduldatei im Kunden-Container: [Offer acceptance checks 39242752877](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39242752877) **SUCCESS**; Emulator, Browser, Unit-/Syntaxprüfungen und deaktivierte Containerprüfung. Kein Deployment aus CI. |
| Cloud-Build | Build `965c746c-3692-4f05-ac68-fb5ac31cf25d` in Zürich **SUCCESS**, 39 Sekunden; Quelle `ca1c7f036c07af6e3e75cd425a041e80341b10ee`. Kein neuer Build nötig. |
| Cloud-Run-Abschlusskontrolle | Nach Shell-Unterbrechung per angemeldeter Google-Cloud-Konsole geprüft: **keine Revision `00010-lars`**, neueste bisherige `00009-avv` bei 0 %, bisherige Demo `00006-h5w` weiterhin bei 100 %. |
| Temporäre Rechte | Nutzer hatte die zwei zeitlich begrenzten Staging-Secret-Grants ausdrücklich genehmigt. Beide Secret-Berechtigungsseiten nach Unterbrechung kontrolliert: **kein Staging-Dienstkonto eingetragen**. Keine temporären Rechte zurückgeblieben. |
| Make-Abschlusskontrolle | `7835460` ursprüngliche Konfiguration samt harter Generierungssperre wiederhergestellt, Gmail deaktiviert. **Verbundenes Make-Readback am 19.10.2026:** `7835460`, `7940261`, `7940220`, `7965215`, `7965223` alle inaktiv mit 0 unvollständigen Ausführungen. Verbindungen von `7940220` melden `ok`; produktive Kundenfilter unverändert, keine TEST_ONLY-Mailausführung. |
| Airtable-Abschlusskontrolle | **Unabhängiger verbundener Airtable-Readback am 19.10.2026:** exakt 20 Offerten und 0 Datensätze mit beiden Produktivfreigaben. Pilot `recR70ZSPynGqA1LS` weiter `Entwurf`, AVV `Nein`, Archivstatus `VERIFIZIERT`; Annahmezeit, Beleg und Versandzeitstempel leer. |

## Verbleibender konkreter Blocker

Google Cloud Shell meldete während des Build-/Release-Befehls ein überschrittenes Nutzungslimit. Der serverseitige Build wurde erfolgreich fertig; der lokale Releaseprozess erreichte keine neue Revision und keine Secret-Grants. Die normale Cloud-Konsole war nach erneuter Identitätsbestätigung erreichbar und wurde ausschliesslich zur Statuskontrolle genutzt. Die private Einladung und der geplante authentifizierte Browser-Bridge-Prozess sind in der gesperrten Shell nicht nutzbar. Die aktuellen verbundenen Schnittstellen bieten keinen Zugriff auf die bestehende Cloud-Shell-Sitzung; deren **heutige Wiederverfügbarkeit wurde nicht bestätigt**. Es gab bei der verbundenen Folgeprüfung weder einen Deploy noch einen Acceptance-POST oder Mailversand.

**Nicht bestanden / nicht ausgeführt:** privater Browserzugang, neue Browser-PDF-Downloads, Browser-Testzustimmungen, angenommener Firestore-/Airtable-Readback, neuer Make-Annahmebeleg und Outlook-Bestätigung für diesen Pilot. Frühere synthetische Erfolge ersetzen diese fehlenden Schritte nicht.

## Fortsetzen ohne Wiederholung erfolgreicher Arbeit

1. Bestehende Cloud-Shell-Arbeitskopie und private Betreiberdatei nach Wiederverfügbarkeit nutzen. Zuvor den Featurebranch bei sauberer Arbeitskopie mit `git pull --ff-only` aktualisieren: Commit `4eed51b5f610aea656e661b8a5aca5bb539d38f4` ergänzt einen Fail-Closed-Check, damit die ursprüngliche Secret-IAM-Bedingung nicht mit weniger als 30 Minuten Restzeit neu vergeben wird. Dieser reine Betreiber-Skript-Fix löst **keinen** neuen Cloud-Build aus. **Nicht nochmals `--seed` und keinen neuen Record/Token/Build erstellen.** Erst `node scripts/internal-test-pilot-once.mjs --status`: nur GET, erwartet den noch nicht angenommenen Testrecord.
2. Danach `python3 scripts/internal-test-pilot-release.py --resume-build 965c746c-3692-4f05-ac68-fb5ac31cf25d`. Die IAM-Bedingung endet am **19.10.2026 um 14:00 UTC (16:00 Europe/Zurich)**. Der Release-Helfer stoppt bei weniger als 30 Minuten Restzeit. **Keine automatische Verlängerung**; nach Ablauf erst einen neuen begrenzten IAM-Zeitraum ausdrücklich prüfen und autorisieren, nicht blind denselben Release wiederholen. Der zugrunde liegende Code bleibt auf bestehenden privaten Stagingdienst, DB/Collection und Archiv begrenzt. Keine Produktivflag-Änderung.
3. `python3 scripts/internal-test-pilot-browser.py` in der angemeldeten Cloud Shell starten und die authentifizierte Webvorschau Port 8080, Pfad `/offerte-annehmen/`, verwenden. Bridge ist auf genau diesen Testrecord begrenzt, ersetzt den nicht geheimen Browser-Platzhalter serverseitig durch den privaten Einladungscode und sendet IAM-authentifizierte Requests an die Stagingrevision. Keine personalisierten Tokens in Browser-URL oder Access-Logs.
4. Offerte und beide PDFs im Browser prüfen; Lars Schulthess / autorisierte Outlook-Adresse eintragen und ausschliesslich die ausdrücklich als Testannahme bezeichnete Aktion einmal auslösen. Bei unklarer Antwort **kein zweiter POST**. `node scripts/internal-test-pilot-once.mjs --readback` prüft unabhängig Annahme/Hashes/Zeit/Person/Zustimmungen und schreibt nur den ausdrücklich nicht rechtsverbindlichen Testnachweis am Testrecord.
5. Bestehendes Make-Szenario `7940220` vorübergehend mit gesicherter Ausgangskonfiguration auf genau diesen angenommenen Record beschränken: rechtliche/Echtbetrieb-/Versandflags false, fester Outlook-Empfänger, TEST_ONLY in Mail und Beleg, Staging-Archiv. Nur einmal ausführen. Beleg-ID, Drive-Sperre/Hash, Gmail-Ausgang und Versandzeitstempel rückprüfen; keine Outlook-Zustellung behaupten, solange sie nicht bestätigt ist. Anschliessend Konfiguration wiederherstellen und deaktivieren. AVV-Ja-Szenario nicht anfassen.
6. Bridge beenden; `python3 scripts/internal-test-pilot-release.py --cleanup` entfernt Testtag und beide temporären Secret-Grants. Demo 100 %, kein Pilottraffic, Produktion false und inaktive Szenarien bestätigen; zentrale Dokumente ersetzen/aktualisieren.

Kein neuer Kundenpilot und keine allgemeinen Infrastrukturtests sind Voraussetzung für diesen autorisierten internen Test. Ein echter späterer Kundenabschluss bleibt ein separater, noch nicht freigegebener Schritt.
