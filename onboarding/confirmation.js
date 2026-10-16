'use strict';

// Read-only, fail-closed evidence of a completed ONBOARDING SUBMISSION workflow.
// "completed" never means the customer project is finished, a Make invitation is
// verified, or any contract is accepted. No Airtable writes or email sends here.
const BASE = 'appzJiskpAdaR1HEv';
const ONBOARDINGS = 'tblWIY4l4VASz8Vse';
const ORDERS = 'tblXUogIvWbulxfnN';
const CUSTOMERS = 'tbl8cUUfFVqsjj2Z0';
const TASKS = 'tblwbAszWFlFJGmgQ';
const VALID_CODE = /^ob_[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;
const VALID_ID = /^rec[A-Za-z0-9]{14}$/;

function oneLink(v) {
  return Array.isArray(v) && v.length === 1 && VALID_ID.test(v[0]) ? v[0] : null;
}
function norm(v) { return String(v ?? '').trim(); }
function allLinks(v, id) { return Array.isArray(v) && v.includes(id); }

async function readAirtable({token, fetchImpl, table, id, formula, fields, timeoutMs = 7000}) {
  const url = new URL('https://api.airtable.com/v0/' + BASE + '/' + table + (id ? '/' + id : ''));
  if (formula) {
    url.searchParams.set('filterByFormula', formula);
    url.searchParams.set('maxRecords', '2');
  }
  // Airtable accepts fields[] on LIST, not GET by record ID.
  // Single-record reads return the fields necessary for server-only verification.
  if (!id) for (const field of fields) url.searchParams.append('fields[]', field);
  const result = await fetchImpl(url.href, {
    method: 'GET',
    headers: {Authorization: 'Bearer ' + token, Accept: 'application/json'},
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!result.ok) throw new Error('airtable_status_unavailable');
  const body = await result.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_status_response');
  return body;
}

async function verifyOnboardingState(projectCode, token, fetchImpl = fetch) {
  if (!VALID_CODE.test(projectCode)) throw new Error('invalid_project_link');
  if (!token) throw new Error('status_not_configured');
  const read = (table, opts) => readAirtable({token, fetchImpl, table, ...opts});

  // A code is a bearer credential; only use validated hex/hyphen input in formulas.
  const onboarding = await read(ONBOARDINGS, {
    formula: "{Projektcode}='" + projectCode + "'",
    fields: ['Projektcode', 'Auftrag', 'Status', 'Sensible Daten',
      'Rechnungsstrasse', 'Rechnungs-PLZ', 'Rechnungsort', 'Rechnungsland',
      'Rechnungs-E-Mail', 'Make-Konto Status', 'Make-Organisation', 'Make-Einladung Status']
  });
  if (!Array.isArray(onboarding.records)) throw new Error('invalid_status_response');
  if (onboarding.records.length === 0) return {state:'processing'};
  if (onboarding.records.length !== 1) return {state:'requires_review'};
  const record = onboarding.records[0];
  if (!VALID_ID.test(record.id) || record.fields?.['Projektcode'] !== projectCode)
    throw new Error('invalid_status_response');
  const f = record.fields;
  const orderId = oneLink(f['Auftrag']);
  if (!orderId || !['Eingegangen', 'Vollständig'].includes(f['Status'])) return {state:'processing'};

  const order = await read(ORDERS, {
    id: orderId,
    fields: ['Onboarding-Token', 'Kunden-Onboarding', 'Kunde',
      'Verbindungen erforderlich', 'AVV erforderlich', 'Make-Kontostatus',
      'Make-Organisation', 'Make-Einladungsstatus']
  });
  if (!VALID_ID.test(order.id) || !order.fields) throw new Error('invalid_status_response');
  const of = order.fields;
  if (of['Onboarding-Token'] !== projectCode) return {state:'requires_review'};
  if (!allLinks(of['Kunden-Onboarding'], record.id) ||
      of['Verbindungen erforderlich'] !== true ||
      of['AVV erforderlich'] !== 'Prüfen' ||
      norm(of['Make-Kontostatus']) !== norm(f['Make-Konto Status']) ||
      norm(of['Make-Organisation']) !== norm(f['Make-Organisation']) ||
      norm(of['Make-Einladungsstatus']) !== norm(f['Make-Einladung Status']))
    return {state:'processing'};
  const customerId = oneLink(of['Kunde']);
  if (!customerId) return {state:'processing'};

  const customer = await read(CUSTOMERS, {
    id: customerId,
    fields: ['Rechnungsstrasse','Rechnungs-PLZ','Rechnungsort','Rechnungsland','Rechnungs-E-Mail']
  });
  if (!VALID_ID.test(customer.id) || !customer.fields) throw new Error('invalid_status_response');
  for (const field of ['Rechnungsstrasse','Rechnungs-PLZ','Rechnungsort','Rechnungsland','Rechnungs-E-Mail']) {
    if (norm(customer.fields[field]) !== norm(f[field])) return {state:'processing'};
  }
  if (['Ja','Unsicher'].includes(f['Sensible Daten'])) {
    const code = orderId + '-DSG-01';
    const tasks = await read(TASKS, {
      formula: "{Aufgabencode}='" + code + "'",
      fields: ['Aufgabencode','Auftrag']
    });
    if (!Array.isArray(tasks.records)) throw new Error('invalid_status_response');
    if (tasks.records.length > 1) return {state:'requires_review'};
    if (tasks.records.length !== 1 ||
        tasks.records[0].fields?.['Aufgabencode'] !== code ||
        !allLinks(tasks.records[0].fields?.['Auftrag'], orderId))
      return {state:'processing'};
  } else if (f['Sensible Daten'] !== 'Nein') {
    return {state:'processing'};
  }
  return {state:'completed', recordId:record.id};
}

module.exports = {verifyOnboardingState};
