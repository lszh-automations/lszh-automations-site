#!/usr/bin/env node
'use strict';
// LEGACY ISSUER DISABLED. The previous implementation wrote a token hash only
// to Airtable and produced ?code= links that can leak into HTTP access logs.
// It is unsafe until issuance and one-time consumption share a transactional
// Firestore source of truth, the RC1 contract is approved, and all PDFs are
// cryptographically verified. The old draft remains available in Git history.
// No environment variable re-enables this script: replacement requires review.
process.stderr.write('BLOCKED: Veraltete Linkausstellung deaktiviert. Atomare Firestore-Ausstellung, geschuetzte #code-Links, PDF-Pruefung und juristische Freigabe fehlen noch.\n');
process.exitCode=2;
