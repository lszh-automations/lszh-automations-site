#!/usr/bin/env bash
# LSZH G3: read-only, independently cryptographic artifact attestation verifier.
# NO registry upload, token generation, permissions, deployment or release approval.
set -euo pipefail

fail() { printf '%s\n' '{"status":"BLOCKED_SIGNED_ATTESTATION_VERIFICATION","releaseStatus":"NO_GO","canPublish":false,"canDeploy":false}'; exit 2; }

# A future, operator-approved release workflow must produce and attest an OCI
# archive from a protected release commit; untrusted PR merge commits are NOT valid.
[ "$#" -eq 4 ] || fail
artifact="$1"; expected_file_sha="$2"; source_sha="$3"; signer_sha="$4"
[[ "$expected_file_sha" =~ ^[a-f0-9]{64}$ ]] || fail
[[ "$source_sha" =~ ^[a-f0-9]{40}$ ]] || fail
[[ "$signer_sha" =~ ^[a-f0-9]{40}$ ]] || fail
[ -f "$artifact" ] && [ -r "$artifact" ] || fail
[[ "$artifact" == *.oci.tar ]] || fail
command -v sha256sum >/dev/null 2>&1 || fail
command -v gh >/dev/null 2>&1 || fail

# Verify the *actual archive bytes*, not an OCI manifest hash or a JSON claim.
actual_file_sha="$(sha256sum "$artifact" | cut -d ' ' -f1)" || fail
[ "$actual_file_sha" = "$expected_file_sha" ] || fail

# The signer workflow does NOT exist in the Draft branch: it must first undergo
# a separately approved protected-main design/review. No PR artifact qualifies.
# GitHub CLI validates the cryptographic Sigstore signature and identity claims.
# These flags enforce repo, exact signer workflow, signer commit, protected source
# ref, and exact source commit. The artifact itself is bound by its SHA-256.
gh attestation verify "$artifact" \
  --repo "lszh-automations/lszh-automations-site" \
  --signer-workflow "lszh-automations/lszh-automations-site/.github/workflows/g3-canary-release-attest.yml" \
  --signer-digest "$signer_sha" \
  --source-ref "refs/heads/main" \
  --source-digest "$source_sha" \
  --predicate-type "https://slsa.dev/provenance/v1" \
  >/dev/null || fail

# Even successfully verified provenance does NOT permit deployment.
printf '%s\n' '{"status":"SIGNED_SOURCE_AND_ARTIFACT_BYTES_VERIFIED_ONLY","releaseStatus":"NO_GO","canPublish":false,"canDeploy":false,"registryReadback":"NOT_VERIFIED","operatorApproval":"NOT_VERIFIED"}'
