# Lokale interne Wiederanlaufstrecke

Die bestehende Make-Verbindung bleibt in Make. Der lokale Node-Ablauf erhält einen eigenen Google-OAuth-Desktop-Client im vorhandenen Projekt `lszh-automations`. Die Client-JSON wird ausschliesslich vom lokalen Benutzerprogramm gelesen, niemals in Git übernommen oder im Chat benötigt.

## Einmalige Einrichtung

1. Google Auth Platform → Clients → Client erstellen → Desktop-App. Name: `LSZH interner Wiederanlauf Surface`. Den bestehenden Make-Webclient nicht verändern.
2. Die JSON-Datei des neuen Desktop-Clients herunterladen. Sie enthält vertrauliche Werte; nicht in Chat, Repository oder Screenshots übernehmen.
3. In PowerShell den bereitgestellten Übernahmehelfer mit dem vollständigen Pfad dieser JSON-Datei aufrufen.

Der Helfer prüft Branch, Ausgangscommit und Arbeitsverzeichnis, übernimmt ausschliesslich den beigefügten Patch und führt die Tests aus. Er installiert die bereits im Staging-Paket aufgeführten Bibliotheken lokal, ohne Installationsskripte. Anschliessend startet er den lokalen OAuth-Einrichtungsschritt. Vor Öffnen des Browsers werden Windows-Benutzerprofil, Verzeichnisrechte und DPAPI-Verschlüsselung mit künstlichen Daten geprüft. Anmeldung ausschliesslich als `lars@lszh-automations.ch`.

Die Zugangsdaten werden als DPAPI-Chiffretext unter `%LOCALAPPDATA%\LSZHAutomations\internal-recovery-oauth.dpapi` gespeichert; das Verzeichnis wird auf den aktuellen Benutzer beschränkt. Ein vorhandener Tresor wird nicht überschrieben. Keine Administratorrechte, keine Änderung der PowerShell-Ausführungsrichtlinie, keine Make-Token-Ausgabe.

Danach führt der Helfer `--check` aus: Geschäftskonto, Gmail-Profil, die zwei Firestore-Beleg-Pins und deren Drive-Metadaten werden lesend geprüft. Keine PDFs werden heruntergeladen. Als letzter Live-Negativtest läuft das vorhandene Nur-Lesen-Skript; beide bereits zugestellten Offerten müssen als `ALREADY_SENT` erkannt werden. Erst danach werden die genannten Quell- und Testdateien committed und auf den bestehenden Feature-Branch gepusht.

## Grenzen und Betrieb

`--authorize <Desktop-JSON>` richtet nur die Anmeldung ein. `--check` ist ausschliesslich lesend. Ein Versand ist allein über einen gesonderten manuellen `--run <freigegebene-interne-Record-ID>` möglich; der Übernahmehelfer ruft diesen Modus nicht auf. Das Modul startet weder Server noch Zeitplan und ist in keine HTTP-Route eingebunden.

Die lokale Strecke nutzt frische Airtable- und Firestore-Daten, die separat hinterlegten Beleg-Prüfsummen sowie die vorhandene atomare Reservierung vor dem Mailanbieter-Aufruf. Zugestellte oder bereits in Bearbeitung befindliche Offerten stoppen vor OAuth/SDK/PDF-Zugriff. Unklarer Versandausgang bleibt gesperrt und verlangt manuelle Klärung. Kein erneuter Versand der zwei abgeschlossenen Testfälle und kein automatischer Erstversand.

Für die lokale Anmeldung werden Cloud Platform (Staging-Firestore), Drive nur lesend, Gmail Versand, Gmail-Metadaten für die Konto-Prüfung und die Google-E-Mail-Identität angefordert. Bestehende IAM-Rechte gelten weiterhin; es werden keine Rechte vergeben. Wenn die Google-App extern im Testmodus bleibt, kann Google eine erneute Anmeldung verlangen. Keine Veröffentlichung des OAuth-Zustimmungsbildschirms durch diesen Helfer.

## Prüfung vor Übergabe

Sechs neue isolierte Tests bestanden: Desktop-Client-Identität, PKCE/State, gemeinsame Token-Erneuerung, falsches Google/Gmail-Konto, frühes Stoppen beider versendeter Fälle und Stoppen bei manipuliertem Datensatz oder offenem früheren Versuch. Der vollständige Offline-Lauf hatte 288 Tests, 282 bestanden, sechs Emulatorfälle planmässig übersprungen, keine Fehler. Der echte Emulatorlauf der bestehenden Reservierung war zuvor in CI erfolgreich; dieser wurde hier nicht erneut ausgeführt.

DPAPI und ACL konnten im isolierten Agenten-Konto nicht vollständig getestet werden (kein geladenes Benutzerprofil und verweigerte ACL-Änderung). Die Benutzerprüfung und der echte OAuth-/SDK-Lesetest sind daher verpflichtende Schritte des Übernahmehelfers und noch ausstehend. Diese Übergabe ist keine Bestätigung einer vollständig live geprüften Laufzeit.
