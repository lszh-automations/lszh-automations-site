# LSZH Automations – sichere Archivprüfung und künftige Offertenannahme

Stand: 15.10.2026. **Entwurfsentscheidung, keine Produktivfreigabe.** Ausschliesslich synthetische Tests. Kein produktiver Vertragsabschluss, keine Kundendaten, keine Live-Deployment-Freigabe.

## Technisch bestätigte Grundlagen

- Geschäftsprojekt `lszh-automations`, Google Cloud Run `lszh-archive-reader-staging` in `europe-west6`, IAM-Authentifizierung, Ingress **Intern**, Laufzeitidentität `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`. Die Google-Drive-API und die Ordnerfreigabe an das Dienstkonto sind eingerichtet.
- Cloud-Run-Logs vom 15.10.2026: `LSZH_ARCHIVE_READER_STAGING: START` 11:43:08.476 MESZ, `PASS` 11:43:09.746 MESZ. Nachweis **nur** für eine synthetische PDF-Datei anhand Google-Drive-Lesefreigabe, PDF-Metadaten, Dateiinhalten und SHA-256. Authentifizierung erfolgt mit Google-verwalteter Dienstidentität, **ohne** herunterladbaren JSON-Schlüssel.
- Die Google-Organisationsrichtlinie `iam.managed.disableServiceAccountKeyCreation` bleibt eingeschaltet.
- Die öffentliche Marketing-Website bleibt auf Render; der separate Render-Staging-Webdienst `srv-db88q5jncjis73f2g93g` und der Draft-PR #5 bleiben isoliert. Website- und Make-Angebotsannahmeszenarien nicht produktiv aktiviert.

## Fortschritt 15.10.2026: wiederverwendbarer PDF-Bündelprüfer

Neu auf dem **nicht gemergten Entwicklungszweig** `feature/optional-avv-acceptance-staging-20261014`:
- `cloud-run/archive-reader-staging/archiveBundleVerifier.mjs` stellt `verifyArchiveBundle(payload, {fetcher,accessToken,archiveFolderId})` bereit. Es prüft strikt das Datenschema und **genau zwei** Dokumente bei `avv_required='Nein'` bzw. **genau drei** bei `'Ja'`: je `id` plus `sha256`. Doppelte IDs, unbekannte Felder und nicht freigegebene Varianten werden vor Google-Zugriff zurückgewiesen.
- Mit Googles kurzlebigem Bearer-Token (bezogen **innerhalb** von Cloud Run, nicht vom Browser) je PDF die Drive-Metadaten laden und `id`, `application/pdf`, `trashed`, Geschäftsordner-Parent, Drive Content Restriction `readOnly`, maximal 12 MiB, SHA-256 sowie **tatsächlich gestreamte Bytes** überprüfen. Wird der Bytestrom grösser als 12 MiB, erfolgt Abbruch; keine Dokumentinhalte werden zurückgegeben oder protokolliert.
- Der neue Test `test/cloudRunArchiveBundle.test.js` verwendet **ausschliesslich lokale synthetische PDFs und Mock-Google-Antworten**; er testet Ja/Nein, kompromittierte Elternordner, aufgehobenen Schreibschutz, manipulierte Metadaten, veränderte PDFs, Fehlerantworten, unzulässige Daten und zu grosse Übertragungen. Github Actions bestätigt **49 von 49 Tests bestanden** für Commit `8a960ee079a5c202652cdaca2a07ed2e2c8cb1c1`, Workflow `38715878086`. Der spätere Workflow-Code prüft zusätzlich Syntax der Bibliothek.
- **Noch nicht** mit dem bestehenden Cloud-Run-HTTP-Einstiegspunkt `archiveHealth` verbunden oder dort bereitgestellt. Der erfolgreiche Cloud-Run-1-PDF-Test vom 15.10.2026 bleibt deshalb unverändert. `verifyArchiveBundle` selbst hat noch keinen Live-Google-Test für zwei/drei Dateien erhalten.

## Wichtige Architekturgrenze: Render kann Cloud Run derzeit NICHT direkt aufrufen

Die Cloud-Run-Instanz hat **Ingress=Intern** und verlangt zusätzlich **IAM-Identität**. Ein externer Render-Webdienst ist keine interne Google-VPC-/Projektressource. Eine unbekannte oder bloss geheime URL genügt nicht. Selbst ein OIDC-Token würde ohne zulässigen Netzwerkweg unter `Ingress=Intern` nicht genügen. Eine blosse Änderung auf `Ingress=Alle` **ohne** abgesicherte Aufrufidentität/Autorisation wäre keine saubere Verbindung. [Google: Ingress](https://docs.cloud.google.com/run/docs/securing/ingress), [Google: Workload Identity Federation](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

Render-Free bietet derzeit keine unmittelbar nutzbare, Google-seitig akzeptierte schlüssellose Identität/Managed OIDC-Verbindung; die Schlüsselerstellung ist in unserer Organisation ausdrücklich gesperrt. Keine Versuche, Organisationsrichtlinien zu deaktivieren, ein JSON in Render einzuschmuggeln oder eine öffentliche unauthentifizierte Archiv-API anzulegen.

## Architekturvarianten für den nächsten technischen Meilenstein

**A. Empfohlen zur Prüfung:** Marketing-Website bleibt auf Render. Die **eigenständige kundenbezogene Annahmefunktion** wird künftig als gesonderter, streng geschützter Cloud-Run-Dienst entwickelt (nicht unser privater Archivprüfer). Externe Kunden benötigen eine erreichbare HTTPS-Seite; das bedeutet, dass dieser **separate** Portal-Service später einen bewusst freigegebenen öffentlichen Netzwerkzugang benötigt. Der Zugang zu individuellen Offerten wird über hochentropische einmalige Token, gehashte Datensätze, Archivbyteprüfung, Ablauf, Ratengrenzen, nur notwendige Dokumentendownloads, Datenschutzhinweise, eine transaktionale/idempotente Annahme-Statusänderung und ein vollständig getestetes Archivprotokoll abgesichert. Das private interne Archivprüfer-Projekt bleibt separat, oder die Google-Cloud-interne Kommunikation benötigt eine korrekt konfigurierte VPC-Verbindung und eigene IAM-Invoker-Rolle; alternativ verfügt der separate Portal-Service über eine eng begrenzte Drive-Reader-Identität. Ein öffentliches Portal ist **nicht** automatisch ein öffentliches PDF-Archiv. Vor Bereitstellung umfassende Bedrohungsanalyse, IAM-, Netz- und Kostenprüfung, Datenschutzprüfung und ausdrückliche Freigabe.
  
**B. Alternative (aufwendiger):** Render hostet weiterhin den Annahme-Endpunkt. Es wird eine vertrauenswürdige schlüssellose Identität für Render via *Workload Identity Federation* (OIDC-Provider) plus ein zugelassener Netzwerkpfad (VPC/Load-Balancer) zu einem privaten Cloud-Run-Dienst aufgebaut. Render-Workspace, Provider und Kosten müssen separat verifiziert werden; derzeit **nicht verfügbar**. Keine Behauptung, Cloud Run sei so schon an Render angebunden.

**C. Für spätere periodische Archivkontrollen, nicht für sofortige Online-Annahme:** Ein Google-Cloud-interner Job/Cloud Scheduler/Cloud Tasks kann mit OIDC und dienstspezifischer IAM-Invoker-Rolle den internen Reader auslösen. Ein separater verifizierter Rückkanal ist für die sichere Beweiskette nötig. Ein alter, zwischengespeicherter Prüfstatus reicht **nicht** für eine rechtswirksame Annahme, weil sich Dateien nach der Prüfung ändern können.

## Vor jeglicher Aktivierung / Genehmigung offener Punkte

1. Architekturentscheidung A oder B für **Kundenportal** und Zuständigkeit von Airtable, Make und PDF-Archiv; kein Hosting-Wechsel ohne bewusste Freigabe.
2. Geschäftsarchiv von privaten Altbeständen bereinigen und stichhaltig mit SHA-256 abgleichen; getrenntes Freigaberegister ins Geschäftskonto migrieren.
3. Für die Annahme: genau zugeordnetes Dokumentenbündel und Hashwerte aus autorisiertem Angebotsdatensatz, keine benutzerbestimmten File-IDs; PDF-Byteprüfung direkt vor Annahme; Einmaligkeit und atomare Zustandsübergänge insbesondere bei parallelen Anfragen sicherstellen. Das bisherige Airtable-Read/PATCH-Muster allein ist **nicht** garantiert atomar bei parallelen Serverinstanzen.
4. Datenschutz/Datenresidenz/AVV und technische Risiken von Drive Content Restrictions vs. WORM archivieren; juristische Prüfung ist vom Geschäftsführer auf später verschoben, **nicht durchgeführt**.
5. Portaleinführung nur auf synthetischem Staging, ohne Kundenmails und mit protokollierten Negativtests; anschliessend ausdrückliche Live-Freigabe.
