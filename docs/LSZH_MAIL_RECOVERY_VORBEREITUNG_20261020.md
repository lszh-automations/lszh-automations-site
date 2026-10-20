# Getrennte Beleg-/Mail-Wiederanlaufstrecke – vorbereitet

Stand 20.10.2026. Nur zwei bestehende interne TEST_ONLY-Records, keine Produktivfreigabe.

## Implementiert und lokal geprüft

- Keine PDF-/Google-Doc-Erzeugung. Ausschliesslich vorhandene, fest zugeordnete PDFs.
- Drei Anhänge für AVV Nein, vier für AVV Ja. Dokumenttyp, Inhaltshash, akzeptierte Hashes, Archivordner und Schreibschutz müssen übereinstimmen. Auch der bestehende Beleg benötigt einen unabhängig festgehaltenen Erwartungshash.
- Feste Outlook-Testadresse, keine CC/BCC und kein frei wählbarer Empfänger.
- Bereits vorhandener Versandzeitstempel beendet den Ablauf ohne Dateizugriff oder Versand.
- Atomare Firestore-Reservierung in einer separaten Staging-Collection vor dem Provider-Aufruf. Stabiler Schlüssel je Quellrecord; geänderte Beleg-IDs/Hashes erzeugen keinen neuen Versandversuch.
- Kein Provider-Aufruf innerhalb der Firestore-Transaktion. Transaktionswiederholungen können deshalb keine Mails auslösen.
- Unklarer Provider-Ausgang, fehlende Message-ID oder fehlgeschlagene Speicherung nach Provider-Erfolg verlangen manuelle Klärung. Keine automatische Wiederholung oder Sperr-Aufhebung.
- Produktivdatenbank und fremde Projekte werden abgewiesen; der Store ist standardmässig deaktiviert.

Neun gezielte Tests bestanden, darunter zwölf konkurrierende Versuche und beide Fehlersituationen nach Versandbeginn.

## Noch nicht freigeschaltet

Dies ist ein vorbereiteter Modul-/Testpatch, keine aktive Make-Automation. Es wurden keine neuen Cloud-Ressourcen, IAM-Rechte, Deployments, Belege oder Mails ausgelöst.

Vor einer Verbindung zu Make fehlen der echte Firestore-Emulatortest des Transaktionsadapters sowie eine prüfbare Provider-/Datenladeanbindung. Insbesondere muss das Laden frischer Airtable-/Firestore-Daten mit der Versandreservierung koordiniert werden. Kein umfassendes Exactly-once-Versprechen gegenüber dem Mailprovider: ein unklarer Versuch bleibt gesperrt und erfordert Abgleich.

Die bereits erfolgreichen internen Annahmen und Testmails dürfen nicht zurückgesetzt oder wiederholt werden. Der Live-Negativtest dieser neuen Strecke und ein kontrollierter Erstversand sind noch nicht ausgeführt.

## Git-Sicherung

Die vorgefundenen, getesteten Änderungen wurden separat als vollständiger Patch mit SHA-256-Datei gesichert. Kein Git-Commit oder Push aus dieser Sitzung: der ursprüngliche Projektordner ist für die Agentensitzung schreibgeschützt. Der bereitgestellte Übernahmeschritt übernimmt ausschliesslich die aufgelisteten Projektänderungen und den vorbereiteten Wiederanlaufentwurf.
