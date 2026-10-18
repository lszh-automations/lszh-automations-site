# LSZH Automations – G3 Authentifizierung Make → interner Reservierungsdienst

Stand 18.10.2026. **Nur Architektur, synthetischer Code und lokaler Firestore-Emulator. Keine neue Cloud-Ressource, IAM-Bindung, aktive Make-Route oder Produktionsfreigabe.**

## Ausgangslage

Das Make-Szenario 7940220 (Annahmebeleg & Bestätigung STAGING) ist inaktiv. Claim-Modul 2 und E-Mail-Modul 8 tragen harte 0=1-Filter. Google Docs wird ab Modul 5 erzeugt; jede künftige Freigabekette muss davor stoppen und die Herkunft des aufrufenden Dienstes beweisen. Der Quellindex für synthetische Airtable-Record-IDs ist ausschliesslich im lokalen Emulator implementiert. Keine externe Anfrage besitzt dadurch Zugriff auf Firestore.

## Bevorzugte Zielarchitektur – nicht aktiviert

1. Der externe Aufrufer muss eine überprüfbare, kurzlebige Dienstidentität besitzen. Nur wenn Make für genau diese Integration einen geeigneten Identity-Provider-Ausweis beschaffen und per HTTP nutzen kann, kommt eine schlüssellose Workload Identity Federation (WIF) infrage. Ein generisches Make-OAuth-2.0-Modul allein beweist diese Fähigkeit **nicht**. Aktuelle Make-HTTP-Dokumentation belegt zwar OAuth 2.0, aber **nicht** den hier erforderlichen STS-/IAM-GenerateIdToken-Flow.
2. Nach expliziter Freigabe könnte Google Cloud STS die geeignete externe Identität föderieren und ein Google-signiertes OIDC-ID-Token mit exakter Cloud-Run-Audience erzeugen. Cloud Run IAM verifiziert den Aufrufer und akzeptiert ihn nur, wenn ihm auf **diesem einen Dienst** eine passende `roles/run.invoker`-Berechtigung erteilt ist. Keine `allUsers`-/`allAuthenticatedUsers`-Freigaben, keine heruntergeladenen JSON-Dienstkonto-Schlüssel.
3. Der interne Reservierungsdienst besitzt eine **getrennte** minimal berechtigte Runtime-Service-Identität, die nur auf die ausdrücklich freigegebene Offerten-Stagingdatenbank zugreift. Firestore serverseitige SDKs umgehen Client-Security-Rules; der genaue Datenbank-IAM-Scope, Index-/Offer-Collection-Policy und geerbte Rechte müssen noch geprüft und genehmigt werden. Die bestehende Quarantäne-CAS-Identität darf nicht für die Offerten-DB wiederverwendet werden.
4. Nach identitätsbasierter Gate-Prüfung sind weiterhin eine serverseitig kanonische Airtable-Quellindex-Auflösung, atomare Review-Reservierung und expliziter STOP vor Make-Modul 5 erforderlich. Ein gewonnener Review-Lock ist keine Docs-/PDF-/Mail-Erlaubnis.
5. Wenn Make keinen geeigneten, überprüfbaren externen OIDC-Ausweis bereitstellen kann, ist WIF **nicht** automatisch nutzbar. Eine alternative interne Gateway-Architektur mit gesondert überprüfter Authentisierung wäre erforderlich. Ein einfacher statischer Make-API-Key, öffentliches Cloud Run mit nur App-Header oder ein JSON-Key auf Make sind nicht als sicherer Ersatz freigegeben.

## Offline-Signatur-Simulation

Neues Modul `cloud-run/offer-portal-staging/syntheticMakeCallerAuth.mjs` validiert **nur einen synthetischen RSA/RS256-Testtoken** mit ephemerem Schlüsselpaar aus dem Testprozess. Geprüft werden Signatur anhand vom Testserver vertrauter RSA-Public-Key-Konfiguration, striktes `kid`, `alg=RS256`, `typ=JWT` ohne injizierte Schlüsselfelder, Aussteller, Audience, synthetischer Dienst-Subject, bestätigte Test-E-Mail sowie `iat/exp/nbf`. Falsche Signatur, falscher Empfänger, Manipulation und Ablauf ergeben NO_GO vor jedem DB-Aufruf.

Eine erfolgreiche Prüfung erzeugt lediglich `VERIFIED_OFFLINE_FIXTURE_ONLY`; Flags für Google Docs, PDF, Drive, Firestore-Write, Airtable und Mail sind immer false. Die nachgeschaltete Methode `authenticatedSyntheticMakeReviewLocalEmulator` ruft nur den bestehenden **lokal emulierten** Source-Index/Review-Reservierungspfad auf. Auch der Antwortcode `RESERVED_REVIEW_ONLY` wird nur als STOP_REVIEW_ONLY projiziert. **Der JWT-Verifier ist ausdrücklich kein für Google Cloud oder reale WIF-JWKS freigegebener Authentifizierungsdienst.**

Die Test-Public-Key-Konfiguration wird durch den vertrauenswürdigen Offline-Harness bereitgestellt, **niemals durch Make-Request-Felder**. Es gibt keine Live-Token-Verifikation, keine Google-Schlüssel-Abfrage, keine Key-Rotation, keinen aktiven Server, keine IAM-Policy-Änderung und kein Deployment. Lokale JWTs mit Test-Schlüsseln dürfen nicht für reale Cloud-Run-Anfragen verwendet werden.

## Minimale spätere IAM-Rollenverantwortung (Plan, keine eingerichteten Rollen)

| Identität | Erlaubnis im Zielbild | Nicht erlauben |
|---|---|---|
| Externer Make-Aufrufer | Nur nach verifizierter Federation/alternativem abgesicherten Gateway | Keine Firestore-, Google-Drive- oder SA-Key-Direktberechtigungen |
| Eng begrenzter Invoker-Principal | `roles/run.invoker` nur auf dediziertem internem Reservierungsdienst | Kein allgemeines Projekt- oder Organisations-Invoker-Recht |
| Separates Reservierungs-Runtime-Dienstkonto | Datenbank-konditionierter Least-Privilege-Firestore-Zugriff, vorbehaltlich IAM-/Anwendungsprüfung | Keine Quarantäne-DB-Rolle, keine Kundenzustellung, keine SA-Schlüssel |
| Quarantäne-CAS-Dienstkonto | Bestehende separate Quarantäneprüfung | Kein Zugriff auf Offerten-Reservierungsdatenbank |

## Vor einem Realtest nachzuweisen

**Blockiert:** tatsächliche Make-Fähigkeit zur ID-Token-Beschaffung und sichere Speicherung der nötigen Identity-Provider-Verbindung; exakte Ziel-Service-URL/Audience; benannter Principal und dessen IAM-/WIF-Berechtigungen; GCP-Organisationspolitik, Gruppen/Deny/PAB und Browser-Portal-Isolation; begrenzte Datenbankrollen und rücknehmbare Berechtigungen; Replay-Schutz, Protokollierung ohne Tokens, Ratelimits; niemals automatisch entriegeln oder erneut einen Beleg erstellen; separate rechtliche und operative Freigabe.

## Testnachweise

- Offline: `test/offerSyntheticMakeCallerAuth.test.js` generiert ephemere RSA-Schlüssel und prüft valide/gefälschte ID-Tokens, falsche Audience/Issuer/Sub/Konto, `alg=none`, Header-Key-Injektion, abgelaufene und überlange Tokens sowie keine Firestore-Abfrage bei fehlender Identität.
- Emulator: `test/offerSyntheticSourceIndex.emulator.test.js` schickt erst eine nicht autorisierte synthetische Anfrage (NO_GO, kein Review-Lock) und prüft danach zwei signierte konkurrierende Anfragen (höchstens ein Gewinner, dennoch STOP vor Modul 5), für AVV Ja und Nein.
- CI und die Pilotsperren sind gesondert in der zentralen Projektdokumentation/Freigabematrix erfasst.

Referenzen: https://docs.cloud.google.com/run/docs/authenticating/service-to-service ; https://docs.cloud.google.com/iam/docs/tutorial-cloud-run-workload-id-federation ; https://apps.make.com/http
