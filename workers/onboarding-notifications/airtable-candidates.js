'use strict';
const VALID_CODE = /^ob_[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;
const BASE = 'appzJiskpAdaR1HEv';
const TABLE = 'tblWIY4l4VASz8Vse';
const FILTER = "AND(OR({Status}='Eingegangen',{Status}='Vollständig'),LEFT({Projektcode},3)='ob_')";

// Bounded full scan: no persisted cursor that might skip records following a crash.
// On overflow, abort before creating any draft; require a paginated production design.
async function listCandidateCodes(token, fetchImpl = fetch, maxCandidates = 200) {
  if (!token) throw new Error('read_token_missing');
  const codes = [];
  const offsets = new Set();
  let offset = '';
  do {
    const url = new URL('https://api.airtable.com/v0/' + BASE + '/' + TABLE);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('filterByFormula', FILTER);
    url.searchParams.append('fields[]', 'Projektcode');
    if (offset) url.searchParams.set('offset', offset);
    const response = await fetchImpl(url.href, {
      method: 'GET',
      headers: {Authorization: 'Bearer ' + token, Accept: 'application/json'},
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('candidate_scan_unavailable');
    const body = await response.json();
    if (!Array.isArray(body?.records) || body.records.length > 100)
      throw new Error('invalid_candidate_response');
    for (const record of body.records) {
      const code = record?.fields?.['Projektcode'];
      if (typeof code !== 'string' || !VALID_CODE.test(code))
        throw new Error('invalid_candidate_record');
      codes.push(code);
    }
    if (codes.length > maxCandidates) throw new Error('candidate_limit_exceeded');
    offset = body.offset || '';
    if (offset) {
      if (typeof offset !== 'string' || offset.length > 512 || offsets.has(offset))
        throw new Error('invalid_candidate_offset');
      offsets.add(offset);
    }
  } while (offset);
  return codes;
}
module.exports = {listCandidateCodes};
