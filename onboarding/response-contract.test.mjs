// Offline regression for the actual inline onboarding frontend, no HTTP/Make/Airtable.
// Run: node --test onboarding/response-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'Inline onboarding script must exist');
const source = match[1];

async function simulate(reply) {
  const status = { textContent: '', style: {} };
  const button = { textContent: 'Onboarding übermitteln', disabled: false };
  let submit, resets = 0, fetchCalls = 0;
  const form = {
    dataset: { makeWebhook: '/api/onboarding' },
    querySelector: () => button,
    reset: () => { resets++; }
  };
  const fields = {
    project_code: { value: '' },
    company: { value: '' },
    project_name: { value: '' },
    projectCodeFallback: { classList: { remove: () => {} } },
    status,
    onboardingForm: { addEventListener: (event, fn) => {
      assert.equal(event, 'submit'); submit = fn;
    } }
  };
  class FakeFormData {
    constructor(f) { assert.equal(f, form); }
    entries() {
      return [['project_code', 'ob_00000000-0000-4000-8000-000000000000'], ['company', 'Nur synthetisch']][Symbol.iterator]();
    }
  }
  const sandbox = {
    URLSearchParams,
    location: { search: '?code=ob_00000000-0000-4000-8000-000000000000' },
    document: { getElementById: id => { assert.ok(fields[id], id); return fields[id]; } },
    FormData: FakeFormData,
    fetch: async (url, opts) => {
      fetchCalls++;
      assert.equal(url, '/api/onboarding');
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers['Content-Type'], 'application/json');
      assert.equal(JSON.parse(opts.body).company, 'Nur synthetisch');
      if (reply.reject) throw new Error('simulated network failure');
      return {status: reply.status, ok: reply.status >= 200 && reply.status < 300,
        text: async () => reply.body};
    },
  };
  runInNewContext(source, sandbox, { timeout: 1000, filename: 'onboarding/index.html' });
  assert.equal(typeof submit, 'function');
  await submit({ currentTarget: form, preventDefault: () => {} });
  assert.equal(fetchCalls, 1);
  return { status, button, resets };
}

const id = 'rec' + 'A'.repeat(14);
const cases = [
  { name: 'Make 200 Accepted is NOT a saved record', status: 200, body: 'Accepted', want: 'noch nicht bestätigt', resets: 0 },
  { name: 'HTTP 202 queued is pending', status: 202, body: '{"queued":true}', want: 'noch nicht bestätigt', resets: 0 },
  { name: '200 with JSON but no durable receipt is pending', status: 200, body: '{"ok":true}', want: 'noch nicht bestätigt', resets: 0 },
  { name: '200 success with malformed receipt is pending', status: 200, body: '{"ok":true,"record_id":"rec123"}', want: 'noch nicht bestätigt', resets: 0 },
  { name: '200 explicit valid receipt confirms storage', status: 200, body: JSON.stringify({ok:true,record_id:id}), want: 'nachweislich gespeichert', resets: 1 },
  { name: 'already complete with valid receipt', status: 200, body: JSON.stringify({ok:true,record_id:id,already_complete:true}), want: 'bereits vollständig gespeichert', resets: 1 },
  { name: '200 conflict JSON rejects success', status: 200, body: '{"duplicate":true,"error":"already_submitted"}', want: 'geprüft werden', resets: 0 },
  { name: '409 is treated as conflict', status: 409, body: '{"error":"conflict"}', want: 'geprüft werden', resets: 0 },
  { name: '500 is not success', status: 500, body: 'Server Error', want: 'nicht bestätigt', resets: 0 },
  { name: 'network timeout is ambiguous, no resend', reject: true, want: 'nicht bestätigt', resets: 0 },
];
for (const scenario of cases) {
  test(scenario.name, async () => {
    const r = await simulate(scenario);
    assert.match(r.status.textContent, new RegExp(scenario.want));
    assert.equal(r.resets, scenario.resets);
    assert.equal(r.button.disabled, true, 'No automatic second POST');
  });
}
