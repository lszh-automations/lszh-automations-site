# LSZH Automations – Arbeitsregeln für neue Agenten/Chats

Zweck: lückenloser, reproduzierbarer Kontext nach Chatwechseln. Bei jeder Aufgabe in diesem Repository gilt:

1. **Zuerst** docs/LSZH_HANDOFF_AKTUELL.md lesen. Ist die Datei nicht auf main, bis zum Merge den Branch feature/chat-handoff-20261018 verwenden. Wenn Datei fehlt: nicht frei rekonstruieren oder produktiv handeln; aktuellen Übergabe-PR abrufen.
2. In der Übergabedatei alle Quellbranches beachten. Der GitHub-main-Projektstand kann veraltet sein; die aktuellen Offerten- und Onboarding-Stände stehen derzeit in getrennten Feature-Branches. Neueste Commits mit Belegen prüfen.
3. Bereits erfolgreich nachgewiesene Tests nicht erneut ausführen. Für jeden Einmal-Job gilt **NEVER RERUN**, auch wenn ein neuer Chat mit 'Vamos' beginnt. Bei Unsicherheit nur Metadaten/Logs lesen.
4. Vor eigener Arbeit: aktuelles Ziel, letzte verifizierte Evidenz, konkrete Lücke, geringstmöglicher Eingriff, Verifikationsweg, Rollback/Freigaben bestimmen. Kein neues Sicherheitssubsystem ohne klaren Bedarf.
5. Niemals eigenmächtig produktive E-Mails, Einladungen, Annahmen, Kundendatenänderungen, IAM-Grants, Secret-Rotationen, live Deployments, Vertragsfreigaben oder Dateilöschungen.
6. Nach substanziellem Fortschritt im eigenen Arbeitsbranch **die Handoff-Datei aktualisieren** (nicht nur die chronologische Projektdokumentation): neueste Belege/Link, 1 konkreter nächster Schritt, verbrauchte One-Shots, weiterhin gesperrte Aktionen. Ein Statuswechsel setzt Belege voraus; Schätzung/CI-Code ist kein Produktionstest.
7. Fehlt Freigabe, arbeite read-only oder synthetisch offline und dokumentiere den Blocker. In Chats keine Zugangsdaten/Token/privaten Projektcodes anfordern.
8. Vor merge nach main beachten: Render-Site besitzt Auto-Deploy. Handoff-PR zunächst Draft, keine Live-Änderung ohne Abnahme.

Dieser Text automatisiert das Lesen nicht für beliebige ChatGPT-Chats. Die dazugehörige Projektanweisung in docs/LSZH_CHATGPT_PROJEKTANWEISUNG.md muss einmalig in den Einstellungen des ChatGPT-Projekts hinterlegt werden.
