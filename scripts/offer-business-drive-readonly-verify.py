#!/usr/bin/env python3
"""Read-only verification of four locked synthetic Google Drive PDFs.

Runs only Drive files.get (metadata and alt=media). The operator passes exact
private file IDs, parent folder and expected post-upload SHA256 as arguments.
Never writes Drive files, IAM policy, Firestore, Cloud Run, or credentials.
Use Google Cloud Shell with business-user gcloud CLI credentials that have
Google Drive access. Tokens are kept in memory, never printed or saved.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import unittest
from urllib import error, parse, request

BUSINESS = "lars@lszh-automations.ch"
MAX_BYTES = 12 * 1024 * 1024
DRIVE_FIELDS = (
    "id,name,mimeType,size,parents,owners(emailAddress),"
    "permissions(type,role),contentRestrictions(readOnly)"
)
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{18,100}$")
SHA_PATTERN = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_NAMES = {
    "TEST_ONLY_quote_AVV_JA_NO_CONTRACT.pdf",
    "TEST_ONLY_quote_AVV_NEIN_NO_CONTRACT.pdf",
    "TEST_ONLY_project_terms_NO_CONTRACT.pdf",
    "TEST_ONLY_avv_NO_CONTRACT.pdf",
}


class GateError(Exception):
    pass


def parse_spec(s):
    parts = s.split(",")
    if len(parts) != 3 or not ID_PATTERN.fullmatch(parts[0]):
        raise GateError("invalid_file_spec")
    try:
        size = int(parts[1])
    except ValueError:
        raise GateError("invalid_expected_size") from None
    if not 100 <= size <= MAX_BYTES or not SHA_PATTERN.fullmatch(parts[2]):
        raise GateError("invalid_expected_hash_or_size")
    return {"id": parts[0], "size": size, "sha256": parts[2]}


def verify_metadata(meta, spec, parent):
    if meta.get("id") != spec["id"]:
        raise GateError("wrong_file_id")
    name = meta.get("name")
    if name not in ALLOWED_NAMES:
        raise GateError("not_a_synthetic_fixture")
    if meta.get("mimeType") != "application/pdf":
        raise GateError("wrong_mime")
    if meta.get("size") != str(spec["size"]):
        raise GateError("size_changed")
    if meta.get("parents") != [parent]:
        raise GateError("wrong_immediate_parent")
    owners = meta.get("owners") or []
    if not any(owner.get("emailAddress") == BUSINESS for owner in owners):
        raise GateError("not_business_owned")
    if any(owner.get("emailAddress") != BUSINESS for owner in owners):
        raise GateError("unexpected_owner")
    # Require API-provided restriction, not a screenshot/label/UI guess.
    restrictions = meta.get("contentRestrictions") or []
    if not any(r.get("readOnly") is True for r in restrictions):
        raise GateError("content_restriction_not_verified")
    permissions = meta.get("permissions")
    if not isinstance(permissions, list):
        raise GateError("permissions_not_verifiable")
    if any(p.get("type") in ("anyone", "domain") for p in permissions):
        raise GateError("public_or_domain_permission")
    return name


def verify_bytes(data, spec):
    if not data.startswith(b"%PDF-"):
        raise GateError("not_a_pdf")
    if len(data) != spec["size"]:
        raise GateError("download_size_changed")
    if hashlib.sha256(data).hexdigest() != spec["sha256"]:
        raise GateError("download_sha256_changed")
    return True


def user_token():
    account = subprocess.run(
        ["gcloud", "config", "get-value", "account"],
        capture_output=True, text=True, check=True, timeout=20
    ).stdout.strip()
    if account != BUSINESS:
        raise GateError("wrong_gcloud_account")
    token = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        capture_output=True, text=True, check=True, timeout=30
    ).stdout.strip()
    if not token or "\n" in token:
        raise GateError("cannot_obtain_access_token")
    return token


def get_google_json(file_id, token):
    qs = parse.urlencode({
        "fields": DRIVE_FIELDS,
        "supportsAllDrives": "true",
    })
    url = "https://www.googleapis.com/drive/v3/files/" + parse.quote(file_id) + "?" + qs
    req = request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "X-Goog-User-Project": "lszh-automations",
        "Accept": "application/json",
    }, method="GET")
    with request.urlopen(req, timeout=25) as result:
        payload = result.read(65536 + 1)
        if len(payload) > 65536:
            raise GateError("metadata_too_large")
        return json.loads(payload)


def get_google_bytes(file_id, token):
    url = "https://www.googleapis.com/drive/v3/files/" + parse.quote(
        file_id) + "?alt=media&supportsAllDrives=true"
    req = request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "X-Goog-User-Project": "lszh-automations",
        "Accept": "application/pdf",
    }, method="GET")
    with request.urlopen(req, timeout=35) as result:
        data = result.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise GateError("download_exceeds_size_limit")
        return data


def live(args):
    if not ID_PATTERN.fullmatch(args.parent):
        raise GateError("invalid_parent")
    specs = [parse_spec(s) for s in args.file]
    if len(specs) != 4 or len({x["id"] for x in specs}) != 4:
        raise GateError("need_exactly_four_distinct_fixtures")
    token = user_token()
    seen = set()
    for spec in specs:
        meta = get_google_json(spec["id"], token)
        name = verify_metadata(meta, spec, args.parent)
        if name in seen:
            raise GateError("duplicate_fixture")
        seen.add(name)
        verify_bytes(get_google_bytes(spec["id"], token), spec)
        print("PASS: " + name + " | readOnly=true, business owner, parent and SHA256")
    if seen != ALLOWED_NAMES:
        raise GateError("incomplete_fixture_set")
    print("SUCCESS: all four business-Drive PDFs locked and byte-verified.")
    print("NOTE: Drive content restrictions are reversible; not immutable/WORM.")
    print("NOTE: no temporary Cloud Run, IAM, Firestore or email changes.")


class OfflineTests(unittest.TestCase):
    def setUp(self):
        self.parent = "1TestFolderABCD1234567890"
        self.bytes = b"%PDF-1.4\nNOT A REAL CONTRACT\n%%EOF\n"
        self.spec = {"id": "1TestFakeFileABC1234567890",
                     "size": len(self.bytes),
                     "sha256": hashlib.sha256(self.bytes).hexdigest()}
        self.meta = {"id": self.spec["id"],
                     "name": "TEST_ONLY_avv_NO_CONTRACT.pdf",
                     "mimeType": "application/pdf",
                     "size": str(self.spec["size"]),
                     "parents": [self.parent],
                     "owners": [{"emailAddress": BUSINESS}],
                     "contentRestrictions": [{"readOnly": True}],
                     "permissions": [{"type": "user", "role": "owner"}]}

    def test_meta_valid(self):
        self.assertEqual(verify_metadata(self.meta, self.spec, self.parent),
                         "TEST_ONLY_avv_NO_CONTRACT.pdf")

    def test_missing_lock_fails(self):
        self.meta["contentRestrictions"] = [{"readOnly": False}]
        with self.assertRaisesRegex(GateError, "content_restriction"):
            verify_metadata(self.meta, self.spec, self.parent)

    def test_wrong_folder_fails(self):
        self.meta["parents"] = ["1WrongParentFolder123456789"]
        with self.assertRaisesRegex(GateError, "wrong_immediate_parent"):
            verify_metadata(self.meta, self.spec, self.parent)

    def test_public_access_fails(self):
        self.meta["permissions"] = [{"type": "anyone", "role": "reader"}]
        with self.assertRaisesRegex(GateError, "public_or_domain"):
            verify_metadata(self.meta, self.spec, self.parent)

    def test_wrong_owner_fails(self):
        self.meta["owners"] = [{"emailAddress": "private@example.invalid"}]
        with self.assertRaisesRegex(GateError, "not_business_owned"):
            verify_metadata(self.meta, self.spec, self.parent)

    def test_bytes_pass(self):
        self.assertTrue(verify_bytes(self.bytes, self.spec))

    def test_tampered_bytes_fail(self):
        with self.assertRaisesRegex(GateError, "sha256_changed"):
            verify_bytes(self.bytes.replace(b"NOT", b"YES"), self.spec)

    def test_bad_file_specs_fail(self):
        for bad in ("invalid", "1TestFakeFileABC1234567890,4,bad",
                    "1TestFakeFileABC1234567890,hi," + "a"*64):
            with self.assertRaises(GateError):
                parse_spec(bad)


def main():
    if sys.argv[1:] == ["--self-test"]:
        unittest.main(argv=[sys.argv[0]], verbosity=1)
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent", required=True, help="Exact business Drive test-folder ID")
    parser.add_argument("--file", action="append", required=True,
                        help="Exact Drive FILE_ID,SIZE,SHA256; repeat four times")
    args = parser.parse_args()
    try:
        live(args)
    except GateError as exc:
        print("NO-GO: " + str(exc))
        raise SystemExit(1)
    except error.HTTPError as exc:
        print("NO-GO: Drive API returned HTTP " + str(exc.code) + ".")
        if exc.code in (401, 403):
            print("Check business gcloud OAuth Drive scope. Do not paste access tokens.")
            print("To enable Google Drive scope: gcloud auth login "
                  "lars@lszh-automations.ch --enable-gdrive-access")
        raise SystemExit(2)
    except (OSError, ValueError, KeyError, json.JSONDecodeError,
            subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print("NO-GO: read-only Drive verification could not complete.")
        raise SystemExit(3)


if __name__ == "__main__":
    main()
