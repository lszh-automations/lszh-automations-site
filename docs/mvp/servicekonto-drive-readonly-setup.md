# LSZH MVP – Read-only-Dienstkonto für das private Geschäftsarchiv
**Stand: 14.10.2026 · Ausführungsanleitung / NICHT produktiv / KEINE FREIGABE**

## Aktueller Stand nach wirklichen Connectorprüfungen

- Der derzeit **auf ChatGPT** verbundene Google Drive-Zugang ist das **private** Konto \`lars.schulthess10@gmail.com\`; seine Staging-Ordner wurden nicht für das Geschäftskonto freigegeben.
- Der vorhandene Make-Drive-OAuth-Zugang \`11904271\` ist hingegen \`lars@lszh-automations.ch\` zugeordnet. Ein echtes Lesen der geschäftlichen **synthetischen** Test-PDF \`14hOfZHVRsBbMBGJCc6ZoAFyKErM37GOp\` war erfolgreich (Make Execution \`9eb6438c03144cdfae0fec8aa5bb8373\`, SHA256 \`759d06e3352f89522aa5e92d14c89175c0d384974d144073299291d47135bff2\`, \`contentRestrictions.readOnly=true\`, keine öffentliche Freigabe).
- Ein **separater Google Cloud Service Account** ist damit **nicht** verifiziert. Dessen tatsächliche Existenz, E-Mail, Schlüssel und Dateiberechtigungen können über die aktuell verfügbaren Render-/Make-/Drive-Schnittstellen nicht eingesehen werden.
- Render-Dienst \`lszh-automations-site\` (\`srv-db1r13ad0e5s7390tcr0\`) deployt von \`main\` automatisch. **Der sichere Portal-Code liegt nur in Draft PR #4**, nicht auf \`main\`; die Render-Service-Metadaten geben keine vorhandenen Secret-Werte preis. \`lszh-swiss-qr-staging\` ist ein anderer Render-Dienst und nicht als Acceptance-Testsystem verwenden.
- **Keine** Änderung an \`OFFER_ACCEPTANCE_ENABLED\`, kein Deploy und keine Public-Linkfreigabe.

## Minimalberechtigter Aufbau (nur mit Geschäfts-/Cloud-Admin und geprüfter Sicherheitsrichtlinie)

1. Google-Cloud-Projekt für LSZH bzw. autorisiertes Kundenprojekt bestimmen, Drive API für das Projekt prüfen. Die genutzte Betriebsidentität und Verantwortlichkeit schriftlich festhalten.
2. Dediziertes Dienstkonto für **nur den read-only PDF-Abruf** bereitstellen (keine Admin-/Editor-Rollen, kein Domain-wide Delegation). Wo praktikabel, **schlüssellose Zugriffsmethoden** gegenüber langlebigen JSON-Privatschlüsseln bevorzugen; der gegenwärtige Verifier-Code unterstützt aber nur ein JSON-Privatschlüsselpaar. Das ist eine bewusste Architekturentscheidung vor Go-Live.
3. Dienstkonto-E-Mail in den Freigabeeinstellungen der **geschäftlichen** Angebots- und Bedingungen-PDF bzw. ihrer privaten Archivordner als **Betrachter/reader** berechtigen. Nur Zugriff auf wirklich benötigte PDFs, nicht auf das ganze Drive und niemals auf private Familien-/Altordner. Vererbung und reale Ordnerstruktur prüfen; Sharing erzeugt ggf. Benachrichtigungen – vor Ausführung mit dem Nutzer abstimmen. Keine Berechtigung für "Jeder mit Link".
4. Bei Verwendung eines JSON-Schlüssels: ausschließlich über ein freigegebenes Secret-Management/Render-Secret \`OFFER_DRIVE_SA_B64\` in der **späteren gesicherten Acceptance-Deployment-Umgebung** hinterlegen; niemals in Chat, Github, Airtable, Make-Logs oder E-Mail kopieren. Rotation/Notfallwiderruf dokumentieren.
5. Feature Flag \`OFFER_ACCEPTANCE_ENABLED=false\` belassen. \`OFFER_TERMS_APPROVED_VERSION\` **nicht** voreilig auf v1.0 setzen.
6. Den read-only Smoke-Test ausschließlich in einer **isolierten Laufzeit, die Draft-Code und das Secret kennt**, gegen die **synthetische** Test-PDF ausführen; er darf keinen echten Vertragsstatus verändern:

   \`\`\`bash
   node scripts/check-offer-service-account.js \
     14hOfZHVRsBbMBGJCc6ZoAFyKErM37GOp \
     759d06e3352f89522aa5e92d14c89175c0d384974d144073299291d47135bff2
   \`\`\`

   Der Test verlangt \`OFFER_DRIVE_SA_B64\` als gesetzte Umgebungsvariable, kontrolliert ID/Hash/PDF-Bytes/Drive-Metadaten samt \`readOnly=true\` und bricht bei aktiviertem Acceptance-Flag ab. Er schreibt **keine** Datensätze, mailt niemandem und setzt **niemals** \`VERIFIZIERT\` oder \`Online-Annahme rechtlich freigegeben\`.
7. Bei 403/404: Servicekonto-E-Mail und exakt den Zielordner prüfen, nicht mit öffentlicher Freigabe umgehen; bei 401/token: OAuth/Servicekonto-Konfiguration prüfen, Schlüssel nicht in Logs kopieren. Ohne erfolgreichen echten Servicekonto-Test verbleibt Freigabegate **NEIN**.
8. Sind *beide* final genehmigten PDF-Dateien vorhanden, den unabhängigen Test für **jede einzelne** ID/SHA ausführen, zum Freigaberegister Ergebnis und Version mit Zeitstempel notieren; zusätzlich die im Produktivcode \`offerArchiveVerifier.verify\` verlangte Kombination aus beiden aktuellen Datei-Metadaten testen.
9. Vor echter Annahme: Version, Datenaufbewahrung/Backup, Incident-Laufbuch, Double-Click-/Mehrinstanzen-Schutz und autorisierte Freigabe separat abschließen. Ein reversibles Google-Drive \`contentRestrictions.readOnly\` ist **kein WORM-Archiv**.

## Testkriterien

- [ ] Geschäfts-/Cloud-Admin identifiziert und Dienstkonto-Mail dokumentiert
- [ ] Servicekonto-Zugriff gilt nur für ausgewählte Geschäfts-PDFs als \`reader\`
- [ ] Keine \`anyone\`- oder private Altarchiv-Berechtigung
- [ ] Secret in isolierter Umgebung sicher gesetzt, Rotation dokumentiert
- [ ] Positiver Zugriff mit dem **tatsächlichen Servicekonto** auf synthetische Test-PDF
- [ ] Negativtest: Konto kann keinen fremden Privatarchivbeleg lesen
- [ ] Final genehmigte Projektbedingungen als PDF mit echter SHA256 + readOnly
- [ ] Echte Offerten-PDF mit eigener SHA256 + readOnly
- [ ] End-to-End-Annahmetests und Rechts-/Geschäftsfreigabe
- [x] Make Geschäftskonto-OAuth-Test auf synthetische Test-PDF erfolgreich
- [x] Make-Leseszenario \`7941848\` nach Test \`inactive\`
- [x] Online-Annahme und produktive Versandmodule weiterhin gesperrt

## Noch erforderliche menschliche Aktion

Eine befugte Person muss einen dedizierten Google-Service-Account im geeigneten Google-Cloud-Projekt freigeben und ihm gezielten Reader-Zugriff auf das Geschäftsarchiv erteilen. Diese Freigabe wurde **bewusst nicht automatisch vorgenommen**; sie wäre eine externe Berechtigungsänderung mit Auswirkungen auf Kundendokumente.
