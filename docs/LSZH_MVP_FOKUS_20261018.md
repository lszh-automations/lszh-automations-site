# LSZH Automations – MVP-Fokus

Stand: 19.10.2026. [Aktueller Stand und verbindliche Übergabe](LSZH_AUTOMATIONS_PROJEKTSTAND.md).

## Ergebnis, das wir fertigstellen

Ein Kunde kann seine Offerte, die Projektbedingungen und gegebenenfalls die AVV samt Anlagen im Browser lesen und getrennt bestätigen. Der Prozess speichert den Annahmenachweis mit Identität, Zeitpunkt und Dokumentversionen/Hashes, aktualisiert Airtable und erzeugt über die vorhandenen Make-Module den Beleg sowie nach entsprechender Freigabe die Bestätigung.

## Abschlusskriterien

- Ein durchgängiger synthetischer Fall für AVV Nein und einer für AVV Ja funktionieren mit den echten vorgesehenen Diensten.
- Genau 2 bzw. 3 Vertrags-PDFs werden zugeordnet; nach Annahme kommt jeweils ein Beleg hinzu.
- Gespeicherte Zustimmung, Dokumentreferenzen, Airtable-Status und Beleg stimmen überein.
- Mehrfachklicks erzeugen keine zweite Annahme; ein fehlgeschlagener Folgeschritt bleibt sichtbar und wird kontrolliert behandelt.
- Kundenunterlagen und konkret benötigte Verbindungen sind für den ersten echten Pilot abschliessend geklärt.
- Technischer Testerfolg ist vom ausdrücklichen Kundenpilot-/Versand-GO getrennt.

## Arbeitsreihenfolge

1. Bereits vorbereiteten und genehmigten privaten synthetischen Cloud-Annahmetest abschliessen.
2. Bestehende Make-Beleg-/Bestätigungsstrecke und beide AVV-Varianten vervollständigen.
3. Einen begrenzten ersten Kundenpilot mit endgültigen Unterlagen und expliziter Freigabe starten.

Konkrete IDs, letzter Teststand, Zugangshindernis und vorhandene Freigaben stehen ausschliesslich im [Projektstand](LSZH_AUTOMATIONS_PROJEKTSTAND.md). Firestore-Seed und separat bestandenen Airtable-Test nicht erneut ausführen.

## Entscheidungen, die nicht erneut offen sind

- Kunden nutzen eigene Make-Organisationen; Make rechnet direkt mit ihnen ab.
- Ausschliesslich Geschäfts-Drive verwenden.
- Projektbedingungen sind geschäftlich akzeptiert; finale Fassung und AVV-Anlagen separat abschliessen.
- Bestehende Szenarien weiterverwenden, keine neue Infrastruktur ohne konkreten Pilotbedarf.

G3/Pub/Sub/Canary, Cockpit V2, neue Branchenmodule und zusätzliche Oberflächen sind zurückgestellt. Bereits bestehende Sperren werden dadurch nicht aufgehoben.

**Arbeitsregel:** Ein konkretes Nutzungsziel → kleinster fehlender Schritt → gezielter Nachweis → aktuellen Projektstand ersetzen. Keine wiederholten Prüfungen ohne veränderten Zustand oder konkreten Fehler.
