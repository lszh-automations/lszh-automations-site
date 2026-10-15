import { http } from '@google-cloud/functions-framework';
import { createHash, timingSafeEqual } from 'node:crypto';

// Ausschliesslich synthetisches Test-PDF im geschäftlichen Google Drive.
const READER = 'lszh-archive-reader@lszh-automations.iam.gserviceaccount.com';
const ARCHIVE_FOLDER = '1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const TEST_FILE = '1W-ZB32pxV7R6EC928BU0iMIAFhSlTno8';
const TEST_SHA256 = '0e5e304feb775fc9ff45478970d6a1582542f58f84c5b03b1f5d8d94fdcea536';
const METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const MAX_BYTES = 12 * 1024 * 1024;
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

async function getResponse(url, headers = {}) {
  const r = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error('read_unavailable');
  return r;
}

async function checkArchive() {
  const metadataHeaders = { 'Metadata-Flavor': 'Google' };
  const identity = await getResponse(`${METADATA}/email`, metadataHeaders);
  if ((await identity.text()).trim() !== READER) throw Error('wrong_service_identity');

  // Cloud Run stellt einen kurzlebigen OAuth-Zugriffstoken zur Verfügung.
  const response = await getResponse(`${METADATA}/token?scopes=${encodeURIComponent(SCOPE)}`, metadataHeaders);
  const credentials = await response.json();
  if (!credentials.access_token) throw Error('no_access_token');
  const headers = { Authorization: `Bearer ${credentials.access_token}` };
  const params = new URLSearchParams({ fields: 'id,mimeType,size,sha256Checksum,contentRestrictions,parents,trashed' });
  const metaResponse = await getResponse(`${DRIVE}${TEST_FILE}?${params}`, headers);
  const meta = await metaResponse.json();

  if (meta.id !== TEST_FILE || meta.trashed === true ||
      meta.mimeType !== 'application/pdf' ||
      !Array.isArray(meta.parents) || !meta.parents.includes(ARCHIVE_FOLDER) ||
      !Array.isArray(meta.contentRestrictions) ||
      !meta.contentRestrictions.some(r => r.readOnly === true) ||
      !Number.isSafeInteger(Number(meta.size)) || Number(meta.size) < 8 ||
      Number(meta.size) > MAX_BYTES || meta.sha256Checksum !== TEST_SHA256) {
    throw Error('archive_metadata_invalid');
  }

  const pdfResponse = await getResponse(`${DRIVE}${TEST_FILE}?alt=media`, headers);
  const advertisedSize = Number(pdfResponse.headers.get('content-length') || 0);
  if (advertisedSize > MAX_BYTES) throw Error('oversized_pdf');
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  if (pdf.length < 8 || pdf.length > MAX_BYTES || pdf.length !== Number(meta.size) ||
      pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw Error('bad_pdf');
  const actual = Buffer.from(createHash('sha256').update(pdf).digest('hex'), 'hex');
  const expected = Buffer.from(TEST_SHA256, 'hex');
  if (!timingSafeEqual(actual, expected)) throw Error('digest_mismatch');
  return true;
}

http('archiveHealth', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  try {
    await checkArchive();
    return res.status(200).json({ ok: true, synthetic: true });
  } catch {
    console.error('LSZH_ARCHIVE_READER_STAGING: FAIL');
    return res.status(503).json({ ok: false });
  }
});

// Nur beim Cloud-Run-Start: ohne externen HTTP-Aufruf prüfen.
if (process.env.K_SERVICE && process.env.K_REVISION) {
  void checkArchive().then(
    () => console.info('LSZH_ARCHIVE_READER_STAGING: PASS'),
    () => console.error('LSZH_ARCHIVE_READER_STAGING: FAIL')
  );
}
