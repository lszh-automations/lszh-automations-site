#!/usr/bin/env python3
"""Give the TEMPORARY Cloud Run service account Drive reader on one synthetic folder only.

Operator-run, business OAuth user only. --check never writes. --apply makes
EXACTLY ONE Google Drive permissions.create on the verified child folder.
No IAM project grants, folder propagation beyond its children, mail, Firestore,
real files, Cloud Run deploy, or production changes.
"""
import argparse
import json
import re
import subprocess
import sys
import unittest
from urllib import error, parse, request

PROJECT = "lszh-automations"
REGION = "europe-west6"
BUSINESS = "lars@lszh-automations.ch"
ROOT = "1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in"
FOLDER = "LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT"
SA = "lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
TEMP = "lszh-offer-browser-staging"
NAMES = {
    "TEST_ONLY_quote_AVV_JA_NO_CONTRACT.pdf",
    "TEST_ONLY_quote_AVV_NEIN_NO_CONTRACT.pdf",
    "TEST_ONLY_project_terms_NO_CONTRACT.pdf",
    "TEST_ONLY_avv_NO_CONTRACT.pdf",
}
ID = re.compile(r"^[A-Za-z0-9_-]{20,100}$")


class GateError(Exception):
    pass


def cli(command):
    p = subprocess.run(command, text=True, capture_output=True,
                       timeout=30, check=True)
    return p.stdout.strip()


def baseline_check():
    import pathlib
    base = pathlib.Path(__file__).with_name("offer-cloud-readiness-readonly.py")
    subprocess.run([sys.executable, str(base)], check=True, timeout=65)
    current = json.loads(cli(["gcloud", "run", "services", "describe", TEMP,
        "--project=" + PROJECT, "--region=" + REGION, "--format=json"]))
    meta = current.get("metadata") or {}
    spec = (current.get("spec") or {}).get("template", {}).get("spec") or {}
    env = {e["name"]: e.get("value") for container in spec.get("containers", [])
           for e in container.get("env", [])}
    if (meta.get("name") != TEMP or
        (meta.get("labels") or {}).get("lszh-purpose") != "offer-browser-smoke" or
        (meta.get("labels") or {}).get("lszh-temporary") != "true" or
        spec.get("serviceAccountName") != SA or
        env.get("LSZH_PORTAL_STAGING_ENABLED") != "false" or
        env.get("LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED") != "true"):
        raise GateError("temporary_demo_identity_or_safety_changed")
    traffic = (current.get("status") or {}).get("traffic") or []
    if len(traffic) != 1 or traffic[0].get("percent") != 100 or \
        traffic[0].get("revisionName") != "lszh-offer-browser-staging-00002-fkq":
        raise GateError("temporary_demo_revision_changed")


def get_token():
    account = cli(["gcloud", "config", "get-value", "account"])
    if account != BUSINESS:
        raise GateError("business_google_user_required")
    token = cli(["gcloud", "auth", "print-access-token"])
    if not token or "\n" in token:
        raise GateError("google_user_access_token_missing")
    return token


def api(token, method, url, body=None):
    headers = {"Authorization": "Bearer " + token,
        "X-Goog-User-Project": PROJECT, "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = request.Request(url, headers=headers, method=method,
                          data=json.dumps(body).encode() if body is not None else None)
    with request.urlopen(req, timeout=30) as r:
        data = r.read(128 * 1024 + 1)
        if len(data) > 128 * 1024:
            raise GateError("api_response_too_large")
        return json.loads(data)


def verify_folder(meta, folder):
    if (not ID.fullmatch(folder) or meta.get("id") != folder or
        meta.get("name") != FOLDER or
        meta.get("mimeType") != "application/vnd.google-apps.folder" or
        meta.get("parents") != [ROOT]):
        raise GateError("unverified_synthetic_child_folder")
    owners = meta.get("owners") or []
    if len(owners) != 1 or owners[0].get("emailAddress") != BUSINESS:
        raise GateError("not_business_owned")
    perms = meta.get("permissions")
    if not isinstance(perms, list):
        raise GateError("permissions_not_visible")
    if any(p.get("type") in ("anyone", "domain") for p in perms):
        raise GateError("broad_folder_sharing_detected")
    for p in perms:
        if p.get("emailAddress") == SA:
            if p.get("role") != "reader" or p.get("type") != "user":
                raise GateError("test_identity_has_broader_permission")
            return True
    return False


def verify_list(data, folder):
    if data.get("nextPageToken"):
        raise GateError("unexpected_pagination")
    files = data.get("files") or []
    if len(files) != 4 or {x.get("name") for x in files} != NAMES or \
        any(x.get("mimeType") != "application/pdf" or
            not ID.fullmatch(str(x.get("id") or "")) or
            x.get("parents") != [folder] for x in files):
        raise GateError("unexpected_contents_in_test_folder")
    return True


def urls(folder):
    base = "https://www.googleapis.com/drive/v3/files/"
    meta = base + folder + "?" + parse.urlencode({"fields":
        "id,name,mimeType,parents,owners(emailAddress),"
        "permissions(id,type,role,emailAddress)", "supportsAllDrives":"true"})
    list_url = base.rstrip("/") + "?" + parse.urlencode({
        "q": "'" + folder + "' in parents and trashed = false",
        "fields": "nextPageToken,files(id,name,mimeType,parents)",
        "pageSize": "10", "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true"})
    create = base + folder + "/permissions?" + parse.urlencode({
        "supportsAllDrives":"true", "sendNotificationEmail":"false",
        "fields":"id,type,role,emailAddress"})
    return meta, list_url, create


def run(folder, apply):
    if not ID.fullmatch(folder):
        raise GateError("invalid_folder_id")
    baseline_check()
    token = get_token()
    meta_url, list_url, grant_url = urls(folder)
    has_reader = verify_folder(api(token, "GET", meta_url), folder)
    verify_list(api(token, "GET", list_url), folder)
    if has_reader:
        print("PASS: exact temporary service account is ALREADY a Reader of the synthetic folder.")
        print("NO CHANGE performed.")
    elif not apply:
        print("PASS: business identity, exact synthetic-only folder and four files verified.")
        print("CHECK ONLY: temporary test identity does not have reader access yet.")
        print("NEXT: run --apply to grant reader on this one child folder.")
    else:
        # No notification email. Does not share parent/root folders.
        created = api(token, "POST", grant_url,
                      {"type": "user", "role": "reader", "emailAddress": SA})
        if created.get("type") != "user" or created.get("role") != "reader" or \
            created.get("emailAddress") != SA:
            raise GateError("unexpected_permission_response")
        if not verify_folder(api(token, "GET", meta_url), folder):
            raise GateError("reader_not_visible_after_grant")
        print("SUCCESS: one isolated synthetic PDF child folder shared as READER")
        print("with the temporary Cloud Run service identity only (no email).")
    # Read-only verification of original internal service remains mandatory.
    baseline_check()
    print("PASS: original internal preflight and temporary static demo unchanged.")
    print("NOTE: no Firestore role, Cloud Run deploy, acceptance, or email.")


class Tests(unittest.TestCase):
    def setUp(self):
        self.folder = "1SyntheticBusinessFolder00000"
        self.meta = {
            "id": self.folder, "name": FOLDER,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [ROOT], "owners": [{"emailAddress": BUSINESS}],
            "permissions": [{"type": "user", "emailAddress": BUSINESS,
                             "role": "owner"}],
        }
        self.files = {"files": [
            {"id": "1SyntheticFakeFile00000" + str(i), "name": name,
             "mimeType": "application/pdf", "parents": [self.folder]}
            for i, name in enumerate(sorted(NAMES))
        ]}

    def test_valid_folder_without_reader(self):
        self.assertFalse(verify_folder(self.meta, self.folder))

    def test_valid_folder_with_reader(self):
        self.meta["permissions"].append({"type": "user", "role": "reader",
                                          "emailAddress": SA})
        self.assertTrue(verify_folder(self.meta, self.folder))

    def test_wrong_parent_blocked(self):
        self.meta["parents"] = ["1WrongPrivateParent000"]
        with self.assertRaises(GateError):
            verify_folder(self.meta, self.folder)

    def test_public_sharing_blocked(self):
        self.meta["permissions"].append({"type": "anyone", "role": "reader"})
        with self.assertRaises(GateError):
            verify_folder(self.meta, self.folder)

    def test_broader_sa_right_blocked(self):
        self.meta["permissions"].append({"type": "user", "role": "writer",
                                          "emailAddress": SA})
        with self.assertRaises(GateError):
            verify_folder(self.meta, self.folder)

    def test_business_owner_required(self):
        self.meta["owners"] = [{"emailAddress": "private@example.invalid"}]
        with self.assertRaises(GateError):
            verify_folder(self.meta, self.folder)

    def test_four_pdf_names_and_parent_required(self):
        self.assertTrue(verify_list(self.files, self.folder))
        self.files["files"].append({"name":"extra.pdf"})
        with self.assertRaises(GateError):
            verify_list(self.files, self.folder)

    def test_wrong_file_location_blocked(self):
        self.files["files"][0]["parents"] = ["1OtherParentFake123456"]
        with self.assertRaises(GateError):
            verify_list(self.files, self.folder)

    def test_notifications_disabled(self):
        self.assertIn("sendNotificationEmail=false", urls(self.folder)[2])


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        unittest.main(argv=[sys.argv[0]], verbosity=1)
    else:
        p = argparse.ArgumentParser(description=__doc__)
        p.add_argument("--folder", required=True)
        act = p.add_mutually_exclusive_group(required=True)
        act.add_argument("--check", action="store_true")
        act.add_argument("--apply", action="store_true")
        args = p.parse_args()
        try:
            run(args.folder, args.apply)
        except GateError as exc:
            print("NO-GO: " + str(exc))
            raise SystemExit(1)
        except error.HTTPError as exc:
            print("NO-GO: Drive API HTTP " + str(exc.code))
            if exc.code in (401, 403):
                print("Verify business account Drive scope; never paste OAuth tokens.")
            raise SystemExit(2)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
                OSError, ValueError, KeyError, json.JSONDecodeError):
            print("NO-GO: setup/Drive verification failed (no wider permission granted).")
            raise SystemExit(3)
