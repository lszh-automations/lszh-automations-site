'use strict';

// STAGING SAFETY GATE: Never enumerate the real CRM. Only explicitly approved,
// synthetic project codes are eligible for validation. No Airtable fetch here.
const VALID_CODE = /^ob_[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;
function listCandidateCodes(configured) {
  if (typeof configured !== 'string' || configured.length === 0 ||
      configured.length > 512) throw new Error('fixture_allowlist_required');
  const parts=configured.split(',').map(v=>v.trim());
  if (parts.length<1 || parts.length>3 || parts.some(x=>!VALID_CODE.test(x)))
    throw new Error('invalid_fixture_allowlist');
  const unique=[...new Set(parts)];
  if(unique.length !== parts.length)throw new Error('duplicate_fixture_code');
  return unique;
}
module.exports = {listCandidateCodes};
