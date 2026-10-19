# LSZH Kundenportal – Firebase Hosting vor Cloud Run Zürich

**Stand:** 19.10.2026. **Nur Vorbereitung; kein Hosting-/DNS-/Kunden-Go-live.**

## Warum Firebase Hosting?

Die direkte Cloud-Run-Domain-Zuordnung ist in `europe-west6` (Zürich) **nicht verfügbar**. Die offizielle Google-Alternative Firebase Hosting unterstützt `run.region=europe-west6`, sodass die bereits vorhandene Cloud-Run-Instanz unverändert in Zürich bleibt. Kein neues Kundenportal-Backend und kein zweites Firestore-Projekt nötig.

Offizielle Quellen:
- https://docs.cloud.google.com/run/docs/locations#domain_mapping
- https://docs.cloud.google.com/run/docs/mapping-custom-domains
- https://firebase.google.com/docs/hosting/cloud-run

## Projekttrennung und Hostnamen

- GCP/Firebase-Projekt: `lszh-automations` (vorhandenes GCP-Projekt; Firebase kann noch nicht aktiviert sein).
- Hosting-Site **exklusiv für das Portal**: `lszh-automations-portal`; kein Ersatz der auf Render betriebenen Firmenwebsite.
- Geplanter Domainname: `portal.lszh-automations.ch`.
- Cloud Run Backend: `lszh-offer-portal` in `europe-west6`; derzeit revision `00002-4zw`, IAM-privat, Env `LSZH_PORTAL_PRODUCTION_ENABLED=false`.
- Nur `/offerte-annehmen/**` und `/api/offer/**` gehen an Cloud Run; sonst ausschliesslich statische 404-Seite. API bleibt durch Portalcode origin- und tokengebunden.

## Sichere Inbetriebnahme – notwendige Reihenfolge

1. Bei Google Cloud/Firebase kontrollieren, dass `lszh-automations` Firebase-fähig ist und Billing/Hosting in diesem selben Projekt freigegeben sind. **Nicht unbemerkt ein neues Projekt erstellen.**
2. Firebase CLI mit **geschäftlichem** Google-Konto autorisieren. Mit `firebase hosting:sites:list --project lszh-automations` zuerst vorhandene Hosting-Sites lesen. Wenn `lszh-automations-portal` fehlt, genau diese Site mit `firebase hosting:sites:create lszh-automations-portal --project lszh-automations` einrichten. Keinesfalls bestehende Website-/Hosting-Sites ändern.
3. Erst wenn der Betreiber diese Site bestätigt hat: Aus Repository-Root `firebase deploy --only hosting --config hosting/customer-portal/firebase.json --project lszh-automations`. Dieser Befehl **publiziert die Routing-Konfiguration**; deshalb bis zur getesteten Bereitschaft zurückhalten. Ein Deployment allein schaltet die Cloud-Run-Vertragsannahme nicht frei.
4. In Firebase Console → Hosting → neuer Site → Add custom domain die Domain `portal.lszh-automations.ch` verbinden, die **dort tatsächlich angezeigten** DNS-Einträge beim zuständigen DNS-Anbieter setzen (keine IPs/CNAMEs raten). SSL-Bereitstellung und Domain-Zustand prüfen. Bestehende `www.lszh-automations.ch`/Render-Einträge unberührt lassen.
5. Für echten Browserzugriff muss Cloud Run am Ende **gezielt öffentlich erreichbar** werden, weil Firebase-Rewrites normalerweise keine benutzerspezifische Google-IAM-Authentisierung an Cloud Run übernehmen. Vorher das Backend auf Final-PDFs, Source-Flags, Rechte, Secret Manager und negative Tests prüfen. Nur `lszh-offer-portal` publik schalten, niemals Staging. Freigabe des Portals erfolgt mit einem **separaten** bewusst gesetzten Runtime-Flag; kein Auto-Go-live.
6. Teste zuerst, dass ohne Freigabe alle Routen nur 503 liefern. Anschliessend einmaligen synthetischen **nicht verbindlichen** Portaltest durchführen, inklusive E-Mail nur an das intern freigegebene Testpostfach. Niemals den AVV-Master mit leeren Anlagen als echte AVV senden.

## Sicherheit und Kosten

Hosting und HTTPS-Domain verursachen ggf. nutzungsabhängige Gebühren und benötigen einen angelegten Firebase-Site-Account. Kein Load Balancer erforderlich. `firebase.json` enthält **keine Secrets** und kein Kunden-/Offertentoken. Statisches `404.html` enthält keine personenbezogenen Inhalte. Der Cloud-Run-Dienst bleibt bis zum dokumentierten Go-live-Gate deaktiviert. Die vorhandene Render-Hauptwebsite bleibt unangetastet.
