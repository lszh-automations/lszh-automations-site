#!/usr/bin/env python3
"""Read-only business Cloud Run preview and two PDF downloads. Never accepts."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ORIGIN = "https://cloud-e2e---lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app"
TOKEN_HASH = "55f035054bf4f5501cf134a9573075e2ef415ce8820290fbd154f017b1394083"
NUMBER = "TEST_CLOUD_E2E_20261018_NO_CONTRACT"
HASHES = {
    "quote": "1c337295c205697dd940668bfc2fb4141fbc67d9dc21f27e764d67ac02e48233",
    "terms": "baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279",
}


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def load_code(path):
    body = Path(path).read_text()
    match = re.search(r"^Single-use invitation code: ([A-Za-z0-9_-]{40,80})$", body, re.M)
    require(match is not None, "test_token_file_format_invalid")
    code = match.group(1)
    require(hashlib.sha256(code.encode()).hexdigest() == TOKEN_HASH,
            "wrong_test_token_file")
    return code


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(path, identity, payload=None):
    require(path in ("/offerte-annehmen/", "/api/offer/preview", "/api/offer/document"),
            "read_only_route_required")
    headers = {"Authorization": "Bearer " + identity, "Origin": ORIGIN}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(ORIGIN + path, data=data, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=90) as response:
            body = response.read(12 * 1024 * 1024 + 1)
            require(len(body) <= 12 * 1024 * 1024, "response_too_large")
            return response.headers.get_content_type(), body
    except urllib.error.HTTPError as error:
        # Do not print server HTML, arbitrary errors, request bodies or credentials.
        detail = ""
        try:
            code = json.loads(error.read(2048)).get("error")
            if code in {"invalid_request", "unavailable", "archive_changed",
                        "temporarily_unavailable", "forbidden", "not_available"}:
                detail = " / " + code
        except (ValueError, AttributeError):
            pass
        raise RuntimeError(path + ": HTTP " + str(error.code) + detail) from None


def preview(code, identity):
    kind, body = request("/offerte-annehmen/", identity)
    require(kind == "text/html" and body.startswith(b"<!DOCTYPE html>"), "page_invalid")
    print("PASS: private Portal-Seite erreichbar.", flush=True)
    kind, body = request("/api/offer/preview", identity, {"code": code})
    require(kind == "application/json", "preview_content_type")
    data = json.loads(body)
    offer = data.get("offer", {})
    require(data.get("ok") is True and offer.get("number") == NUMBER and
            offer.get("test_only") is True and offer.get("test_accept_enabled") is True and
            offer.get("avv_required") is False and
            offer.get("terms_version") == "TEST_v1.0_RC1", "preview_identity_mismatch")
    require(all(offer.get(k + "_sha256") == v for k, v in HASHES.items()),
            "preview_document_hash_mismatch")
    print("PASS: exakt vorhandene synthetische Offerte, AVV Nein.", flush=True)
    for which, expected in HASHES.items():
        kind, body = request("/api/offer/document", identity, {"code": code, "which": which})
        require(kind == "application/pdf" and body.startswith(b"%PDF-") and
                hashlib.sha256(body).hexdigest() == expected,
                which + "_pdf_mismatch")
        print("PASS: " + which + "-PDF heruntergeladen und SHA-256 bestaetigt.", flush=True)
    print("PASS: Cloud-Portal, Firestore-Lesen und beide Drive-PDFs funktionieren.")
    print("Keine Annahme, kein Airtable-PATCH, kein Make-Lauf, keine E-Mail.")


def token_path(explicit):
    if explicit:
        return Path(explicit).expanduser()
    filename = "lszh_synthetic_cloud_test_20261018_token.txt"
    candidates = {Path.home() / filename, Path.cwd() / filename,
                  Path.home() / "Downloads" / filename,
                  Path.home() / "lszh-automations-site-checkout" / filename}
    found = [p for p in candidates if p.is_file()]
    if len(found) == 1:
        return found[0]
    require(sys.stdin.isatty(), "use_--token-file_with_private_local_path")
    return Path(input("Lokaler Pfad zur vorhandenen Testtoken-Datei (kein Token): ").strip()).expanduser()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token-file")
    args = parser.parse_args()
    code = load_code(token_path(args.token_file))
    auth = subprocess.run(["gcloud", "auth", "print-identity-token",
                           "--account=lars@lszh-automations.ch"],
                          capture_output=True, text=True, timeout=30)
    require(auth.returncode == 0 and auth.stdout.strip(), "google_identity_unavailable")
    preview(code, auth.stdout.strip())


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired):
        # Exception text from files or transport could include private paths.
        error = sys.exc_info()[1]
        print("STOP:", str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1)
