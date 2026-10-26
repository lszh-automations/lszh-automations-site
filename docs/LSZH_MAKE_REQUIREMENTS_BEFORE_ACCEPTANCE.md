# Make-Voraussetzungen vor der Offertenannahme

Stand: 26.10.2026. Implementiert und synthetisch geprüft, noch nicht produktiv bereitgestellt. Keine bestehenden Angebote, Pakete, Freigaben oder Kundenannahmen migriert.

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

## Bereitstellung nach gesonderter Freigabe

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
