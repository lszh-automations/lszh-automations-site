# C4.4 – Geschäftsunterlagen und vollständiger Paket-Publisher

Stand 25.10.2026. Lokale Vorbereitung; keine Cloud-Bereitstellung, Änderung aktiver Make-Szenarien, Berechtigungsänderung oder E-Mail in dieser Runde.

## Aktueller Dokumentbestand statt älterer RC1-Annahmen

Read-only im verbundenen Geschäftskonto lars@lszh-automations.ch festgestellt und tatsächliche PDF-Bytes heruntergeladen/mit SHA-256 geprüft:

| Gegenstand | Drive-ID | Bytes | SHA-256 |
|---|---|---:|---|
| Projektbedingungen v1.0 vom 19.10.2026, geschäftlich freigegeben | 1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX | 95511 | b5421778dd88bdac6697cb4f258319fba6577a9b26cba75509ef4e55df4fc2aa |
| AVV-Rahmenvorlage v1.0 vom 19.10.2026, Anlagen kundenspezifisch auszufüllen | 1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x | 89954 | bde130a9cacd693265521df144fa236e43077ad8ed55388fae079cc7fd97ecc1 |

Bestätigtes Produktionsarchiv: 10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN, Name LSZH Automations Vertragsarchiv – PRODUKTION, Eigentümer Geschäftskonto. Bereits vorhandenes Lesekonto lszh-offer-portal@lszh-automations.iam.gserviceaccount.com; keine zusätzlichen Rechte vergeben. Unterordner für versendete Originale: 1DaUcSCHdBxF42aunDgqqCmdzbdMBFxYe.

Damit sind die älteren Feststellungen «nur RC1-Entwürfe bekannt» und «Produktionsarchiv noch zu identifizieren» für den aktuellen Drive-Bestand überholt. Der reine lokale crm-v2-Quellbaum enthielt weiterhin nur TEST_ONLY-PDFs; die tatsächlichen Geschäfts-PDFs liegen separat im Geschäftskonto. Keine Geschäfts-PDFs ins Repository kopiert.

Die ausgelesenen Projektbedingungen sehen standardmässig Vertragsabschluss mit ausdrücklicher Kundenannahme vor, lassen aber ausdrücklich abweichende Offertenregeln zu. Die vorhandene CRM-Offerten-PDF enthält den Vorbehalt einer schriftlichen LSZH-Auftragsbestätigung. Der vorbereitete Pfad erhält diesen Vorbehalt und verlangt dazu confirmationPolicy=explicit_offer_reservation. Keine automatische Umstellung der Vertragsbeginnlogik und keine unabhängige juristische Prüfung behauptet.

Die AVV-Rahmenvorlage verlangt vollständige und zutreffende Anlagen A–C pro Kunde; ihr Freigabevermerk gilt dem Rahmenwortlaut. Die unveränderte Rahmenvorlage wird deshalb technisch blockiert, auch wenn ein Aufrufer pauschal alle Anlagen als vollständig bezeichnet.

## Neu verbunden

- contract-document-catalog.json: tatsächliche IDs, Fassungen, Bytezahlen und Hashes, kein Sendeschalter aktiviert.
- contract-document-selection.js: feste Projektbedingungen; kunden-/paketspezifische Freigabe; AVV nur als separat archivierte Kundenfassung mit passenden freigegebenen Anlagen A, B und C.
- contract-production-document-reader.js: ausschliesslich Lesen, OAuth-Scope drive.readonly. Bedingungen aus festem Produktionsarchiv, Offerte/kundenbezogene AVV aus festem Original-Unterordner. Keine Upload-/Rechtefunktion.
- contract-package-publisher.js: standardmässig ausgeschaltete Backend-Orchestrierung für prepare → dispatch/reconcile → issueLink. Kein Import in die laufenden CRM-/Portaldienste.
- contract-live-package-bridge.js: verknüpft Publisher mit gespeicherter, befristeter Pilotfreigabe (pilotRelease_<Paket-ID-Hash>) und dem tatsächlichen Annahmeservice. Freigaben kommen aus der Backend-Datenbank, keine verified-/approved-Flags aus Kunden-JSON.

## Tatsächlicher Publisher-Ablauf

1. Paket/AVV-Regeln validieren, interne Operatoridentität und explizite Freigabe prüfen, alle archivierten PDF-Bytes gegen die Paketmetadaten prüfen.
2. In einer Transaktion gespeicherte CRM-Offerte und verknüpften Lead/Kunden lesen. Die aktuelle CRM-PDF erneut deterministisch erzeugen und gegen die archivierte Offerten-PDF prüfen; ihr kaufmännischer Snapshot muss exakt dem Paket entsprechen. Geänderter Preis, Adresse oder Dokumentinhalt blockiert.
3. Vorbereitung als unveränderlichen Veröffentlichungsdatensatz speichern. Noch kein Versand und kein Annahmelink.
4. Bei ausdrücklichem dispatch sämtliche PDFs nochmals prüfen, eine dauerhafte Sperre pro Offerte anlegen und delivery_review vor dem externen Aufruf speichern. Bestehende CRM-Versandsperren werden mitverwendet. Gmail/Make-Aufruf immer ausserhalb der Transaktion und genau einmal.
5. Versandpayload enthält 2 oder 3 tatsächliche archivierte PDFs in kanonischer Reihenfolge, genau einen Empfänger, info@lszh-automations.ch, keine CC/BCC, Event-/Pakethash. Vorhandene Mailgestaltung wird wiederverwendet.
6. Nur unabhängiger Gmail-SENT-Nachweis für richtige Nachricht, Absender, Empfänger, leere CC/BCC, Event, Paket und sämtliche Hashes setzt Paket/CRM auf sent/Versendet. Provider-Receipt allein genügt nicht. Timeout oder unklarer Nachweis bleibt gesperrt; ein neuer Prozess versendet nicht automatisch erneut.
7. Erst danach darf issueLink den dauerhaften Annahmeservice aufrufen. Das versendet keine zusätzliche Mail. Die spätere CRM-Oberfläche muss die separate Herausgabe des privaten Links ausdrücklich steuern; kein Token in Listen oder Logs.
8. Kundenannahme wird wie bisher dauerhaft protokolliert; Offertenstatus bleibt Versendet und interne Prüfung bleibt erforderlich.

## Nachweise

385/385 reguläre lokale Node-Tests PASS. 26/26 vollständige Demo-Emulatorprüfungen PASS, danach zusätzlicher integrierter Publisher→Annahmeservice→dauerhafte Kundenantwort-Test PASS; Publisher-Suite insgesamt 5/5, insgesamt 27 unterschiedliche Emulatorfälle bestanden. Ausschliesslich demo-lszha-c2-20261025 auf 127.0.0.1:8788; Transport/Provider nur abgefangen, keine echten E-Mails.

Geprüft: 2/3 PDFs, exakte archivierte Bytes, unabhängiger Nachweis vor Linkausgabe, gleichzeitige Versandaufrufe genau einmal, Sperre über neue Instanz hinweg, verlorene Providerantwort ohne Wiederholung, falscher Nachweis ohne Link, geänderter CRM-Snapshot und beschädigtes Archiv vor Versand blockiert, gespeicherte Pilotfreigabe statt Browserflags, Rahmen-AVV gesperrt, getrennte Produktionsordner.

Emulatorroutine/CI um Publisher-Prüfungen erweitert. Workflow-YAML und git diff --check PASS.

## Verbleibende operative Verdrahtung

Der Publisher und die dokumentierte Annahmeschnittstelle sind lokal integriert und getestet. Noch NICHT umgesetzt/aktiviert sind:

- authentifizierte CRM-Bedienung für Dokumentauswahl, AVV-Einstufung, Paketvorbereitung, ausdrücklichen Paketversand und Link-Herausgabe;
- dedizierter realer Make-Mehr-PDF-Transport und allgemeiner unabhängig geprüfter Gmail-SENT-Adapter für neue echte Pakete (Callback-Schnittstellen implementiert, bisherige einzelne Teststrecke nicht pauschal zu Produktionstransport erklärt);
- Produktionsdeployment des getrennten Portals und notwendige, vorab geprüfte Archiv-/Secret-Verknüpfungen;
- konkret ausgewählte Pilot-Offerte, passende AVV-Anlagen und im Backend erfasste befristete Freigabe;
- kontrollierter tatsächlicher Pilotlauf und Traffic-/Kundenfreischaltung.

Aktiver Ein-PDF-CRM-Versand und bestehendes Staging-Portal bleiben unverändert. Keine Testangebote in die Produktion migrieren und keinen alten Receipt als vollständigen Paketnachweis verwenden.
