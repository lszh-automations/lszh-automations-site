# C47 – Vereinfachung «Prüfen und senden», 25.10.2026

Bereitgestellte Revision: `lszh-crm-v2-00078-fox`, Konfiguration `lszh-crm-contract-live-pilot-config:4`. Portal und übrige Konfiguration unverändert. Live-Umschaltung bedarf noch der konkreten Zustimmung zum zusätzlichen automatischen Einladungsversand; die automatische Freigabeprüfung hat die Umschaltung zunächst abgelehnt.

## Bedienung

Eine gespeicherte, versandbereite Offerte zeigt die tatsächliche Kundenadresse, Offertennummer, Dokumente und geschützte Dokumentansichten. Die Frage zur Verarbeitung von Personendaten ist bewusst zu beantworten. Dokumentprüfung und Aufbewahrung bleiben ausdrückliche Entscheidungen. Danach startet «Prüfen und senden» den gesamten Ablauf:

1. Vorschau-Snapshot mit dem aktuellen CRM-Eintrag vergleichen.
2. Bei Bedarf das exakte Dokumentpaket erstellen und die PDFs archivieren.
3. Freigabe, Archivbytes und Snapshot erneut prüfen und das Paket einmalig verschicken.
4. Tatsächliche Gmail-SENT-Nachricht mit Empfänger, Dokumentbytes, Ereignis und Paket-Hash unabhängig nachweisen.
5. Erst dann einen befristeten privaten Annahmelink erzeugen und eine separate kurze Einladung von info@lszh-automations.ch an dieselbe gespeicherte Kundenadresse zustellen.
6. Auch diese Einladung unabhängig im SENT-Postfach anhand von Empfänger, Paket, Ereignis und exaktem Link nachweisen.

Die technischen Einzelknöpfe der Paketvorbereitung und der bisherige separate PDF-Versand werden bei Verwendung dieses Ablaufs ausgeblendet. Legacy-Ansichten bereits abgeschlossener Offerten bleiben verfügbar. Interne Annahmeprüfung und schriftliche LSZH-Auftragsbestätigung bleiben getrennt und unverändert geschützt.

## Dauerhafte Sperren

- Bestehende Paket-Versandclaims bleiben erhalten; kein automatischer erneuter PDF-Versand.
- Ein vorhandener Provider-Receipt wird vor dem unabhängigen SENT-Abgleich dauerhaft gespeichert. Bei Bedarf bietet die Oberfläche eine reine erneute Statusprüfung; eine Gmail-Nachrichten-ID muss im Normalfall nicht eingegeben werden.
- Der Einladungsclaim `invitationDelivery_<SHA256(packageId)>` wird vor Linkerstellung und Mailversand dauerhaft und atomar angelegt. Separate Prozesse erzeugen zusammen höchstens einen Link und eine Einladung.
- Ein unklarer Einladungsversand bleibt `delivery_review`; weder neuer Link noch neue Mail werden automatisch erzeugt. Keine pauschale Retry- oder Recovery-Freigabe.
- Der rohe private Link wird nicht in diesem Claim gespeichert; dort steht nur seine SHA-256-Prüfsumme. Link und Gmail-Inhalt werden nicht protokolliert.
- Eine erforderliche AVV bleibt an den geprüften Backend-Datensatz und die ausgefüllten kundenspezifischen Anlagen gebunden. Keine Annahme oder rechtliche Zustimmung durch den Agenten.

## Make

Neues Szenario `8177143`, «LSZH CRM – persönliche Annahmeeinladung nach Versandnachweis», privater Webhook in CRM-Konfiguration Version 4. Bestehende geschäftliche Gmail-Verbindung, Absender info@lszh-automations.ch, genau ein im Backend gebundener Empfänger, keine CC/BCC, fester freigegebener Portalursprung. Eine Aktivierung des Szenarios selbst versendet keine Mail.

Die Datenstruktur wurde bei ausgeschaltetem, aktionslosem Szenario mit synthetischen Werten eingelernt. Vor Aktivierung war die Warteschlange leer. Der einzige anschliessende Kontrolllauf `654b63163b7f4520be41b06450251fb2` enthielt einen leeren Empfänger und `NO_SEND_VALIDATION`: ausschliesslich Webhook-Modul 1 ausgeführt, keine Gmail-Aktion. Keine echte Einladung oder sonstige Kundenmail im Rahmen dieser Implementierung versendet.

## Prüfungen

- 427 lokale Tests bestanden.
- 29 Tests mit echtem lokalem Firestore-Emulator bestanden, einschliesslich zwei unabhängiger Prozesse und verlorener Einladungsantwort.
- Zugriffsprüfungen für Vorschau, private Vertragsdokumente und zentrale Aktion; anonyme Canary-Abfragen jeweils HTTP 401.
- Neue Oberfläche an der Canary-Adresse HTTP 200. Tatsächliche Konfiguration Version 4 ohne Datenzugriff erfolgreich initialisiert. Revision Ready=True, Vertragsaktionen/Versand/interne Prüfung true.
- Benutzeroberflächentests: Vorschau und gespeicherte Adresse vor Versand, bewusste Freigaben, Snapshot-Bindung, keine alte Paket-Knopfkette, reine Statusprüfung und kein Wiederholungsversand bei unklarer Einladung.
- Kein neuer End-to-End-Kundenversand; bewusste Beschränkung auf lokale Tests, Emulator, lesende Bereitstellungsprüfung und empfängerlosen negativen Make-Test.

Die angemeldete Live-Oberfläche wird nach autorisierter Umschaltung lesend geprüft. Zurückschaltung bei Bedarf auf `lszh-crm-v2-00075-bef` mit Konfiguration Version 3; neue Versand- und Einladungsclaims dabei niemals löschen und keine alten Make-Ausführungen wiederholen.

## 26.10.2026 – ausdrückliche Freigabe und Live-Aktivierung
Der Nutzer hat ausdrücklich «Ja, diesen Ablauf im Live-CRM aktivieren» bestätigt, einschliesslich der zusätzlichen persönlichen Einladung an dieselbe gespeicherte Kundenadresse nach unabhängig nachgewiesenem PDF-Versand. Die frühere automatische Ablehnung ist damit durch die geforderte konkrete Freigabe aufgelöst.
Revision lszh-crm-v2-00078-fox wurde von 0 auf 100 % Live-Verkehr umgeschaltet. Die anschliessende Dienstabfrage bestätigt genau diese Revision mit 100 %, reguläre CRM-URL HTTP 200 und neue Oberfläche enthalten. Es wurde kein Kundenversand ausgelöst. Die angemeldete vorherige Oberfläche verlangte nach dem Laden der neuen Version erneut eine Google-Anmeldung; Sichtprüfung der neuen Vorschau bis zu dieser erneuten Anmeldung noch offen.

## 26.10.2026 – angemeldete Live-Sichtprüfung
Nach erneuter Geschäftsanmeldung die aktuelle Live-Oberfläche ausschliesslich lesend geprüft. Offertenliste zeigte fünf Offerten: 1004 angenommen, 1003/1002/1001/1000 versendet; keine Offerte «Bereit». Offerte 1001 geöffnet. Nach Laden der Vertragsdaten wird der nachgewiesene Paketversand und genau die passende Folgeaktion «Persönlichen Annahmelink zustellen» angezeigt; alte Versand-Einzelschritte ausgeblendet. Keine Checkbox gesetzt, keine Versand-/Einladungs-/Annahmeaktion und kein Speichern ausgelöst. Die vollständige Vorschau vor Versand bleibt mangels bereitem Bestandsdatensatz in dieser Live-Sichtprüfung ungetestet; vorhandene lokale Tests, Emulator und geschützte Routenprüfungen gelten weiterhin.
Screenshot im Arbeitsordner: output/customer-general-release/simple-live-ui-20261026.png. Nebenbefund zur späteren UI-Bereinigung: Editorüberschrift bei Offerte 1001 lautet «Angenommen», während Statusfeld und Liste «Versendet» zeigen. Kein Geschäftsstatus geändert und keine Annahme daraus abgeleitet.
