# C4.3 – Vorbereitung der Live-CRM-Anbindung

Stand 25.10.2026. Lokale Implementierung und Tests, keine Bereitstellung, keine Kundenfreischaltung, keine produktiven Datenänderungen oder E-Mails in dieser Runde.

## Bestandsbefund

Der bestehende Live-Sender offer-send.js erzeugt und versendet eine einzelne Offerten-PDF über kind=offer_send. Die bestätigte Gmail-ID wird an der Offerte gespeichert. Es fehlen dort bislang versionierte Bedingungen/AVV, ein vollständiger Paket-Versandnachweis und eine serverseitige Link-Herausgabe. Eine bisherige Versandbestätigung oder manuelle Postfachbestätigung beweist daher nicht das vollständige Online-Annahmepaket.

Der bereitgestellte Kundenportal-Staging-Dienst bleibt unverändert, fest auf Testpaket und Lars beschränkt. Eine Übernahme des Testdatensatzes ins Live-CRM ist ausdrücklich nicht vorgesehen.

## Implementierte Vorbereitungen

### 1. Unveränderlicher Versand-Snapshot, standardmässig aus

offer-dispatch-snapshot.js erfasst aus dem reservierten Offertenstand die kaufmännischen Felder, normalisierte Positionen/CHF-Summen und Empfängeranschrift sowie den Hash der tatsächlichen PDF-Bytes. Interne Leadnotizen und Freitext aus dem Lead werden nicht übernommen.

cloud-records.recordOfferDispatchSnapshot speichert den Snapshot transaktional unter <CRM-Präfix>offer_dispatch_snapshots/<attemptId>; nur passend zur aktuellen Versandreservierung und Empfängeradresse. Bereits vorhandene abweichende Hashes werden abgewiesen. Speicherung erfolgt vor dem Provider-Aufruf; ein Speicherfehler bricht die Vorbereitung ohne Mail ab.

server.js übergibt den neuen Schalter CRM_OFFER_SNAPSHOT_ENABLED. Nur der exakte Wert true aktiviert den Pfad. Keine Cloud-Umgebungsvariable wurde gesetzt. Der Legacy-Snapshot kennzeichnet completeContractPackage=false und ist kein Ersatz für den späteren vollständigen Paketnachweis.

### 2. Reine Pilot-Prüfung ohne Nebenwirkungen

contract-acceptance-live-readiness.inspectLiveAcceptance prüft:

- echte, gespeicherte, versendete Offerte; keine TEST_ONLY-Offerte;
- gültiges Paket derselben Offerte/Nummer mit echten versionierten Dokumentreferenzen;
- unabhängigen Gmail-SENT-Readback für genau Event, Nachricht, Empfänger, Paket und sämtliche Dokumenthashes;
- ausdrückliche befristete Pilotfreigabe für genau Offerte, Paket und Empfänger;
- bestätigte Vertretungsadresse sowie fachliche Freigabe von Erklärungstexten und Aufbewahrung.

Das ist ein vorbereiteter Prüfbaustein, keine öffentliche Freigabe-API und keine Vertrauensquelle für vom Browser gelieferte Behauptungen. Die Eingaben müssen beim späteren Verdrahten aus vertrauenswürdigen Backend-Nachweisen stammen. Es wird kein Link erzeugt und keine Mail gesendet.

### 3. Getrennte interne Prüfung und schriftliche Bestätigung

contract-acceptance-review.createAcceptanceReview arbeitet auf der vorhandenen dauerhaften Transaktionsschnittstelle und ist standardmässig disabled. Es ist noch nicht in einen HTTP-Endpunkt oder die laufende Cloud-Revision eingebunden.

approve verlangt autorisierte interne Identität und einen archivierten, hashgeprüften Annahmenachweis. Es setzt Paket und CRM-Annahme auf awaiting_lszh_confirmation und schreibt einen unveränderlichen Prüfbeleg. Konkurrierende Freigaben können nur einmal erfolgreich sein.

confirm verlangt anschliessend einen separat, serverseitig geprüften schriftlichen Versandnachweis zur gleichen Offerte/Paketversion und zum gleichen Empfänger, mit tatsächlichem Bestätigungshash und Versandzeit nach der internen Prüfung. Es schreibt einen eigenen Bestätigungsbeleg und den Zustand confirmed. Der CRM-Offertenstatus bleibt weiterhin Versendet; es erfolgt keine Mail und keine automatische Gewinnbuchung.

### 4. Bestehende CRM-Gewinnwege absichern

Die zentrale win()-Funktion verhindert bei Offerten mit onlineAcceptance die vorzeitige Übernahme zu Angenommen/Gewonnen. Benötigt werden confirmed, reviewRequired=false und archiveState=complete. Die Sperre greift sowohl bei manueller Annahme der Offerte als auch bei Gewonnen am Lead. Bestehende Offerten ohne Online-Annahme folgen weiterhin dem bisherigen Weg.

Die Änderung ist nur lokal vorbereitet, nicht im Live-Dienst aktiv.

## Verifikation

- 380/380 reguläre Node-Tests bestanden.
- 22/22 tatsächliche Firestore-Demo-Emulatorprüfungen bestanden, Demo-Projekt demo-lszha-c2-20261025, ausschliesslich 127.0.0.1:8788, ohne Cloud-Credentials.
- Neue Prüfungen: Legacy-Einzel-PDF reicht nicht; falsche Hashes/Empfänger/Freigaben blockieren; Snapshot-Fehler verhindert Versand; beide manuellen Gewinnwege gesperrt; fehlende Archivierung sperrt interne Freigabe; parallele Freigaben erzeugen genau einen Prüfbeleg; falscher schriftlicher Nachweis bestätigt nichts; Bestätigung erzeugt keine automatische Kunden-/Projektbuchung.
- Emulatorroutine und CI um Freigabeprüfungen erweitert; Workflow-YAML und git diff --check bestanden.

## Noch vor einem Live-Pilot erforderlich

1. Fachlich freigegebene echte Bedingungen und AVV samt Anlagen mit festen Archiv-IDs, Versionskennungen und Hashes auswählen. Im aktuellen crm-v2-Quellbaum sind nur TEST_ONLY-PDF-Fixtures als unmittelbar nutzbare Paketdokumente vorhanden.
2. Den Paket-Publisher und dedizierten Mehr-PDF-Versand implementieren/verdrahten: aus dem gespeicherten Offerten-Snapshot archivierte Original-PDFs, vollständiger unabhängiger SENT-Nachweis und befristete Freigabe zur Pilot-Offerte. Keine nachträgliche Umdeutung des Legacy-Receipts.
3. Link-Herausgabe aus dem authentifizierten CRM mit dauerhaftem Freigabe-/Paketbezug und Vertrauensprüfung anbinden. Der Link darf erst für nachgewiesene Versandversionen verwendbar sein; kein öffentlicher Issuer und kein Token in CRM-Listen/Logs.
4. Autorisierungs- und Bestätigungs-Verifier der neuen internen Prüfung an echte Backend-Nachweise anbinden; danach geschützte CRM-Aktionen und deren UI ergänzen. Niemals Browser-Flags wie verified=true akzeptieren.
5. Produktionsarchiv und separaten Live-Portaldienst mit eigenen Secrets/Identitäten vorbereiten. Der vorhandene Archivordner und bereitgestellte Dienst sind ausdrücklich STAGING. Die neue Live-Verbindung soll diesen Testbestand nicht stillschweigend zum Produktionsarchiv erklären.
6. Genau eine Pilot-Offerte samt befristetem Empfänger freigeben; keine pauschale Aufhebung der Staging-Mailbegrenzung. Einmaliger Live-Smoke mit eigenständiger Zustimmung und Rückfallplan.

## Vorgesehene Reihenfolge und Rückfall

Zuerst Quelländerungen in einer geschützten Revision ohne Live-Traffic prüfen; neue Schalter aus lassen. Dann nur für künftige autorisierte Offerten den Snapshot-Pfad freigeben und prüfen. Danach einen vollständigen Paket-Pilot mit expliziter Freigabe verbinden. Erst nach dokumentiertem Abschluss weitere Kunden freischalten.

Bei Problemen Link-Herausgabe und Code-Anforderungen des Pilotdienstes stoppen, Snapshot-Schalter wieder deaktivieren bzw. Traffic zur vorherigen CRM-Revision zurückführen. Annahme-, Freigabe- und Versandnachweise sowie Einmalsperren erhalten; keine automatischen Wiederholungsmails oder Löschung von Belegen.
