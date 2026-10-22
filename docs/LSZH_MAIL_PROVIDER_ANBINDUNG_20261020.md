# Interne Daten-/Mailprovider-Anbindung

Stand 20.10.2026. Vorbereitete, standardmässig deaktivierte interne TEST_ONLY-Anbindung.

- Airtable-REST-Leser: feste Base/Tabelle, ausschliesslich die zwei bestehenden internen Testrecords.
- Firestore-Leser: nur benannte Staging-DB im bestehenden Projekt, Quellindex/Offer-Zuordnung geprüft. Keine Schreibfunktion und kein Fallback auf Produktivdaten.
- Frischer Datenabgleich: Annahmezeit, Person, Zustimmungen, Dokument-IDs, akzeptierte Hashes und Versionen zwischen Airtable und Firestore. Vorhandener Versandnachweis beendet den Ablauf vor weiteren Providerzugriffen.
- Bestehende Belege benötigen einen unabhängig hinterlegten ID-/SHA-256-Pin. Der Loader erstellt keine Pins und keine PDFs automatisch.
- Drive: nur PDF aus dem festen Testarchiv mit Schreibschutz; begrenzter Byte-Stream muss exakt zu Metadatenhash und Dateigrösse passen. Der nachfolgende Versandplan prüft zusätzlich die akzeptierten Hashes.
- Gmail: standardmässig deaktiviert. Expliziter Adapter verlangt autorisierten Tokenlieferanten, prüft das Geschäfts-Gmail-Profil und erlaubt ausschliesslich die feste Outlook-Adresse, drei/vier definierte PDFs und TEST_ONLY-Betreff. Keine CC/BCC, frei wählbaren Header oder Kundenmails. MIME-Nachricht und API-Antwort werden lokal mit Fake-Providern geprüft.
- Nach atomarer Versandreservierung wird die Quelle samt PDF-Daten erneut gelesen. Änderungen oder ein inzwischen vorhandener Versandnachweis sperren den Provider-Aufruf dauerhaft bis zur manuellen Klärung.

Keine neue Make-Automation, kein Runtime-Start, kein Deployment, keine neue Mail und keine Cloud-IAM-Änderung durch diesen Patch. Zugangsdaten werden nicht in Git, Dateien oder Logs abgelegt.

Die tatsächliche Bereitstellung der OAuth-Token und der unabhängig geprüften Beleg-Pins ist bewusst noch nicht automatisch aktiviert. Die bestehenden zwei Testmails dürfen nicht erneut versendet werden. Zwischen dem letzten externen Airtable-Read und Gmail bleibt eine systemübergreifende Änderung technisch möglich; vollständige atomare Freigaben über beide Anbieter werden nicht behauptet. Vor einem Kundeneinsatz sind ein abgestimmtes Sperr-/Freigabeverfahren und getrennte Produktionskonfiguration erforderlich.
