# Mail-Wiederanlauf – dedizierter Emulatortest

Stand 20.10.2026. Commit `7999abe49419052dcd0ad8993813cca14af3f6fc` wurde auf GitHub unabhängig geprüft:

- [Offer acceptance checks 39455482300](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39455482300): alle vier Jobs erfolgreich (Unit-/Offline-Tests, bestehende Firestore-Emulatortests, Chromium, deaktivierte Container).
- [G3 build-only 39455482302](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39455482302): erfolgreich, kein Deployment.

Diese grünen Emulatortests deckten den neuen Wiederanlaufadapter noch nicht ab. Der vorliegende Patch ergänzt ausdrücklich:

- zwölf parallele Versuche gegen echte SDK-Transaktionen im lokalen Firestore-Emulator; genau ein Fake-Provider-Aufruf;
- verlorene Providerantwort, fehlgeschlagene Speicherung nach Provider-Erfolg, bereits versandte Mail und unbekannter vorhandener Reservierungszustand;
- fremde Attempt-ID darf einen gespeicherten Providerbeleg nicht überschreiben;
- striktes Opt-in für `demo-lszh-automations`, `127.0.0.1:8088`, benannte Staging-DB, keine Cloud-Runtime und keine Credentials-Datei;
- Aufnahme des neuen Tests in den bestehenden reinen Emulator-CI-Job.

Provider ist ausschliesslich ein lokaler Fake. Keine Make-Aktivierung, E-Mail, IAM-Änderung oder Cloud-Datenmutation. Testartefakte werden nur im exakt gegateten Demo-Emulator angelegt und gelöscht.

Der neue echte Emulatortest ist vor dem Push noch nicht ausgeführt: Java und die Firebase-/Firestore-Testabhängigkeiten sind in der aktuellen Agentensitzung nicht verfügbar. Lokale Unit-/Guard-Prüfungen sind davon zu unterscheiden. Erst der neue GitHub-Lauf kann diesen ergänzten Emulatortest bestätigen.
