# C3.7.3 – Ergebnis des freigegebenen Vorabchecks

25.10.2026: Neuer reiner Lesejob lszh-crm-c373-contract-readback erfolgreich in europe-west6 bereitgestellt. Image-Digest sha256:58c2c9b8ed69964263c9a60f0b5ed484fcf911fc15239f8f899c764632e2a17b. Bestehender SA lszh-crm-c37-ro, Secret-Version 1, eine Task, null Wiederholungen, keine Command-/Args-Ueberschreibung und Versandflags false.

Genau ein policy_only-Lauf: lszh-crm-c373-contract-readback-d8rg6. Anwendung startet korrekt, Vorabcheck BLOCKED, Exitcode 1. Kein zweiter Lauf und keine Testmail.

Ursache rein lesend eingegrenzt. Secret nur im Prozessspeicher validiert; Ausgabe ausschliesslich Bool-Werte:

- Gueltige Secret-Huelle: ja.
- Vorgegebener Absender info@lszh-automations.ch in Allowlist: ja.
- Vorgegebener Empfaenger lars.schulthess@outlook.com in Allowlist: nein.

Keine OAuth-/Secretwerte ausgegeben, gespeichert oder veraendert. Make-Szenario 8174297 nicht aktiviert, Sperrfilter nicht geaendert und Versand nicht aufgerufen.

Vorbereitete, noch nicht angewendete Behebung: crm-v2/scripts/c373-allow-test-recipient.cjs ergaenzt ausschliesslich den vorgegebenen Empfaenger und erhaelt alle bisherigen Adressen und sonstigen Felder unveraendert. Drei synthetische Tests bestanden. Standardmodus liefert nur eine nicht vertrauliche Vorschau. Emit-Modus darf ausschliesslich direkt an Secret-Manager-stdin angeschlossen werden, niemals an ein Terminal oder eine Datei.

Zusaetzliche Freigabe benoetigt: neue Version des dedizierten Secrets mit genau dieser Allowlist-Ergaenzung anlegen und ausschliesslich den neuen C3.7.3-Lesejob auf die zurueckgegebene feste Versionsnummer umstellen. Version 1 und bestehende Jobs/Dienste unveraendert lassen. Danach einen neuen Vorabcheck durchfuehren; nur bei PASS die bereits freigegebene einzelne Testmail senden und genau deren drei PDF-Anhaenge lesen/pruefen. Keine eigenmaechtige Secret-Aenderung oder Umgehung der Sperre.
