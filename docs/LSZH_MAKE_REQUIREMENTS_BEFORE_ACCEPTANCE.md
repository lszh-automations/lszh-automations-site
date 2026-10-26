# Make-Voraussetzungen vor der Offertenannahme

Historischer Release-Nachweis vom 26.10.2026; anschliessend durch [Auftragsbest�tigung und Annahmebenachrichtigung](LSZH_ORDER_CONFIRMATION_AND_NOTIFICATIONS.md) erweitert. Der folgende Abschnitt beschreibt die damalige Erstaktivierung.

Stand der Erstaktivierung: 26.10.2026. **Live aktiviert** nach ausdrücklicher Benutzerfreigabe. CRM `lszh-crm-v2-00081-yaf` und Portal `lszh-customer-acceptance-pilot-00007-lig` erhalten jeweils 100 % regulären Verkehr. Keine bestehenden Angebote, Pakete, Freigaben oder Kundenannahmen migriert.

## Live-Nachweis

Zuerst wurde das abwärtskompatible Portal bereitgestellt und umgeschaltet, danach das CRM. Beide zunächst mit 0 % regulärem Verkehr; anschliessend lesend geprüft. Die tatsächlichen Cloud-Quellarchive wurden zurückgeladen und alle 103 vorbereiteten Laufzeitdateien anhand SHA-256 abgeglichen. Images, Build-IDs, Archivorte und Verkehrszuordnung stehen im [Live-Manifest](../releases/make-requirements-live-20261026.json). Quellcommit: `0acd51f60868b78328899c7bdf4b1ace7958c85b`.

Die Prüfsummen der gesamten Umgebungsvariablen/-referenzen sowie die Dienstkonten sind gegenüber dem Zustand vor der Bereitstellung unverändert. Insbesondere bleiben CRM-Vertragskonfiguration Version 4 und Portalkonfiguration Version 3 erhalten. Bestehende Anmeldeschlüssel, Claims, Make-Szenarien, Archive und Kundendaten wurden nicht geändert.

Portalgesundheit bestätigt `ok=true, mode=customer`. Die feste Portal-Origin liefert die neuen HTML-/JS-Dateien; ohne Annahmelink bleibt die Annahme-API mit HTTP 404 gesperrt. Auf der separaten Portal-Testadresse verweigert der bestehende feste Hostschutz wie vorgesehen den Zugriff auf HTML/API mit HTTP 403; der Healthcheck ist dort erfolgreich. Dieser Schutz wurde nicht abgeschwächt. Das CRM liefert die neue Oberfläche und verweigert anonyme Vertragsabfragen mit HTTP 401. Zum Abschluss keine neuen Error-Level-Logs der beiden Revisionen.

Kein E-Mail-Code, Kundenversand oder Annahmeklick wurde zum Live-Test ausgelöst. Die vollständigen Funktions-/Speichertests erfolgten vorher ausschliesslich synthetisch und im Demo-Emulator. Die Live-Prüfung ist lesend und ersetzt keinen neuen realen Vertragsabschluss.

Rückfallversionen: Portal `00005-rab`, CRM `00078-fox`. Bei einer Rückschaltung muss ein inzwischen neu erzeugtes Paket mit Make-Hinweis vom kompatiblen Portal weiterhin unterstützt werden; deshalb das Portal nicht blind auf die alte Version zurückstellen, sobald neue Pakete existieren. Versand-/Einladungsclaims niemals löschen oder alte Ausführungen wiederholen.

## Kundeninformation

Neue Offerten enthalten den Hinweis auf ein eigenes Make-Konto mit eigener Organisation. Nach der schriftlichen LSZH-Auftragsbestätigung lädt der Kunde LSZH Automations mit den erforderlichen Berechtigungen in seine Organisation ein. LSZH unterstützt die Einrichtung. Allfällige Make-Abonnements und nutzungsabhängige Kosten trägt der Kunde direkt; sie sind im Offertenpreis nicht enthalten. Technische Umsetzung erst nach Einrichtung und Prüfung der benötigten Zugänge.

Dieselbe Information steht in der Offertenvorschau, im Offerten-PDF, in der internen Paketvorschau und auf der Kundenannahmeseite unmittelbar vor den Zustimmungserklärungen. Die bestehenden ausdrücklichen Zustimmungen zur Offerte und den Vertragsdokumenten bleiben erhalten. Es werden weder ein Make-Konto noch eine Einladung durch diesen Schritt erstellt und keine zusätzliche Zustimmung für alte Pakete behauptet.

## Versionierung und Bestandsschutz

- Feste Textversion MAKE_CUSTOMER_ORGANISATION_v1_20261026 mit SHA-256 über Version, sichtbare Versionsbezeichnung, Titel und Absätze.
- Neue Paketvorbereitungen erzeugen das PDF mit diesem Hinweis und binden Textversion/-hash zusätzlich in den Offertensnapshot und Pakethash ein. Archivbytes werden unverändert zurückgelesen und geprüft.
- Unabhängiger Paketversand prüft das PDF mit der **im Paket gespeicherten** Hinweisversion. Keine globale Umstellung vorhandener Pakete auf den aktuellen Text.
- Pakete ohne Hinweisversion behalten ihre ursprünglichen Hashes und PDF-Ausgabe. Bereits vorbereitete Legacy-Pakete erhalten auch in ihrer Vorschau keinen neuen Hinweis. Das Portal zeigt für sie keinen nachträglichen Pflichttext an.
- Das Portal liefert den Hinweis nur aus dem geprüften Paket. Der Annahmenachweis speichert Version, Text und Textprüfsumme zusammen mit dem bestehenden Pakethash. Browserangaben können diese Werte nicht vorgeben.
- Der historische Produktionsstand bleibt im Tag production-2026-10-26 nachweisbar. Seine Prüfung erfolgt nun mit `node scripts/verify-production-baseline.cjs --ref production-2026-10-26`; die aktuelle Entwicklung wird durch ihre eigenen Tests geprüft.

## Verfahren für spätere Bereitstellungen

1. Zuerst das abwärtskompatible **Kundenportal** mit den neuen Paketfeldern bereitstellen. Es akzeptiert weiterhin unveränderte Legacy-Pakete.
2. Anschliessend das **CRM** bereitstellen, das neue Pakete mit dem Make-Hinweis erzeugt. Keinesfalls zuerst neue Pakete erzeugen, während das Portal noch nur das alte Schema kennt.
3. Aktuelle Dienstkonten, Konfigurationen, Secret-Versionen, IAM-Regeln und dauerhaft gespeicherten Versand-/Einladungsclaims erhalten. Keine erneute Paketmail und keine Datenmigration.
4. Nach Bereitstellung zuerst lesend prüfen. Ein echter Versand-/Annahmetest benötigt einen ausdrücklich bestimmten synthetischen Vorgang. Agent nimmt keinen Vertrag an.

Lokale Quellpakete ohne Kundendaten oder Secrets vorbereiten:

```text
node scripts/prepare-make-requirements-source.cjs portal NEW_PORTAL_OUTPUT_DIRECTORY
node scripts/prepare-make-requirements-source.cjs crm NEW_CRM_OUTPUT_DIRECTORY
```

Der Generator verwendet die bekannte Laufzeitdateiliste plus das neue Hinweis-Modul. Er überschreibt keine bestehenden Verzeichnisse und führt keine Cloud-Aktionen aus. Alte historische Deployskripte mit festen Dateilisten nicht für diese Version verwenden, da sonst das neue Modul fehlen kann.

## Prüfungen

436 CRM-Regressionen, 32 Portalregressionen und 30 echte Demo-Firestore-Emulatorprüfungen erfolgreich. Darunter: Paket-/Snapshotbindung, unveränderte Legacy-Hashes, vorbereitete Alt-Pakete, PDF- und Annahmevorschau, neue Nachweisdaten nach Backendwechsel. Desktop/Mobil-Browserprüfung mit vollständig abgefangenen synthetischen GET-Anfragen, ohne POST oder Kundendaten. PDF gerendert und visuell geprüft; der Hinweis bleibt als zusammenhängender Block lesbar.

Keine bestehenden Bedingungen-/AVV-PDFs wurden geändert. Der Hinweis steht in der Offerte selbst und ist damit Teil der bereits vorgesehenen Dokumentzustimmung. Die technische Änderung behauptet keine unabhängige Rechtsprüfung.
