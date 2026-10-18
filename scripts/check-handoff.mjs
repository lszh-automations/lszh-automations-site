import fs from 'node:fs';
import process from 'node:process';

const file = 'docs/LSZH_HANDOFF_AKTUELL.md';
const errors = [];
const notices = [];
const body = fs.readFileSync(file, 'utf8');
const required = [
  '# LSZH Automations – verbindliche Chat-Übergabe',
  '## Stand',
  '## Verifizierte Ergebnisse',
  '## Aktive Arbeitszweige',
  '## Offene Freigabegates',
  '## Nicht wiederholen',
  '## Genau ein naechster Schritt',
  '## Sicherheitsgrenzen',
  '## Quellen und Verifikation',
  '## Übergabe-Disziplin'
];
for (const heading of required) {
  if (!body.includes(heading)) errors.push('Fehlender Abschnitt: ' + heading);
}
for (const risk of ['Nie wieder starten', 'Keine produktiven E-Mails', 'Keine Cloud-IAM', 'main', 'feature/optional-avv-acceptance-staging-20261014', 'feature/onboarding-notification-outbox-20261016']) {
  if (!body.includes(risk)) errors.push('Fehlender Pflichtmarker: ' + risk);
}
const target = body.match(/## Genau ein naechster Schritt\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim();
if (!target || target.length < 80) errors.push('Konkreter nächster Schritt fehlt');
const date = body.match(/Zuletzt fachlich geprüft \(UTC-Datum\): (\d{4}-\d{2}-\d{2})/)?.[1];
if (!date || !Number.isFinite(Date.parse(date))) errors.push('Gültiges Prüfdatum fehlt');
if (date) {
  const age = Math.floor((Date.now() - Date.parse(date + 'T00:00:00Z')) / 86400000);
  if (age > 3) notices.push('Übergabe älter als drei Tage: Live-Fakten erneut prüfen (keine automatische Faktenübernahme)');
  if (age < -1) errors.push('Prüfdatum liegt in der Zukunft');
}
const remote = process.argv.includes('--remote');
const repo = process.env.GITHUB_REPOSITORY || 'lszh-automations/lszh-automations-site';
if (remote) {
  for (const branch of ['main', 'feature/optional-avv-acceptance-staging-20261014', 'feature/onboarding-notification-outbox-20261016']) {
    const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'LSZH-handoff-check' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
    const url = 'https://api.github.com/repos/' + repo + '/branches/' + encodeURIComponent(branch);
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      if (!response.ok) { errors.push('Quelle nicht abrufbar: ' + branch + ' (HTTP ' + response.status + ')'); continue; }
      const item = await response.json();
      const sha = item?.commit?.sha;
      if (!/^[a-f0-9]{40}$/.test(sha || '')) { errors.push('Ungültiger Branch-Commit: ' + branch); continue; }
      notices.push('Branch ' + branch + ' HEAD: ' + sha.slice(0, 12) + ' – im neuen Chat vor Weiterarbeit mit Handoff vergleichen');
    } catch (e) {
      errors.push('GitHub-Branchprüfung fehlgeschlagen: ' + branch + ' (' + (e?.name || 'unknown') + ')');
    }
  }
}
const status = errors.length ? 'STOP: Handoff-Prüfung unvollständig' : 'PASS: Handoff-Struktur vollständig';
console.log(status);
for (const n of notices) console.log('INFO: ' + n);
for (const e of errors) console.error('FEHLER: ' + e);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### LSZH Übergabekontrolle', status, ...notices.map(x => '- ' + x), ...errors.map(x => '- FEHLER: ' + x), '', 'Hinweis: Branch-HEAD-Prüfung ist kein automatischer Geschäftsstatus und ersetzt keine Handoff-Aktualisierung.', ''].join('\n'));
}
if (errors.length) process.exitCode = 1;
