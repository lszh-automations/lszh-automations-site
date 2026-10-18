#!/usr/bin/env python3
"""One operator-authorized synthetic accept, followed by independent GET readback."""
import argparse
import importlib.util
import json
import subprocess
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "preview", Path(__file__).with_name("offer-browser-synthetic-avv-preview.py"))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
require = preview.require
RECORD = "recktLXj5wUxLmHFQ"
EMAIL = "fake-lszh-e2e@example.invalid"
PERSON = "Synthetischer Cloud-Testkunde"
FIRESTORE = ("https://firestore.googleapis.com/v1/projects/lszh-automations/"
             "databases/lszh-offers-staging/documents/lszh_staging_offers_v1/" + preview.TOKEN_HASH)
AIRTABLE = "https://api.airtable.com/v0/appzJiskpAdaR1HEv/tbljeIUoD7wwKuSmS/" + RECORD


def credential(args):
    r = subprocess.run(["gcloud", *args, "--account=lars@lszh-automations.ch"],
                       capture_output=True, text=True, timeout=30)
    require(r.returncode == 0 and r.stdout.strip(), "credential_unavailable")
    return r.stdout.strip()


def api(url, token, payload=None):
    require(url in (FIRESTORE, AIRTABLE, preview.ORIGIN + "/api/offer/accept"),
            "unexpected_endpoint")
    require(payload is None or url == preview.ORIGIN + "/api/offer/accept",
            "only_portal_may_write")
    headers = {"Authorization": "Bearer " + token}
    data = None
    if payload is not None:
        headers.update({"Origin": preview.ORIGIN, "Content-Type": "application/json"})
        data = json.dumps(payload).encode()
    req = urllib.request.Request(url, headers=headers, data=data)
    try:
        with urllib.request.build_opener(preview.NoRedirect()).open(req, timeout=90) as r:
            body = r.read(256 * 1024 + 1)
            require(len(body) <= 256 * 1024, "response_too_large")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        raise RuntimeError("provider_http_" + str(e.code)) from None


def decode(value):
    for key in ("stringValue", "booleanValue", "timestampValue", "doubleValue"):
        if key in value:
            return value[key]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "nullValue" in value:
        return None
    if "mapValue" in value:
        return {k: decode(v) for k, v in value["mapValue"].get("fields", {}).items()}
    if "arrayValue" in value:
        return [decode(v) for v in value["arrayValue"].get("values", [])]
    raise RuntimeError("unexpected_firestore_value")


def read_state(google, airtable):
    doc = api(FIRESTORE, google)
    require(doc.get("name") == FIRESTORE.split("/v1/")[1], "wrong_firestore_document")
    s = {k: decode(v) for k, v in doc.get("fields", {}).items()}
    row = api(AIRTABLE, airtable)
    require(row.get("id") == RECORD, "wrong_airtable_record")
    f = row.get("fields", {})
    require(s.get("tokenHash") == preview.TOKEN_HASH and
            s.get("offerNumber") == preview.NUMBER and s.get("recipientEmail") == EMAIL and
            s.get("source", {}).get("recordId") == RECORD and
            s.get("source", {}).get("kind") == "LSZH_SYNTHETIC_ONLY" and
            s.get("termsVersion") == "TEST_v1.0_RC1", "firestore_identity_changed")
    require(s.get("bundle", {}).get("avv_required") == "Ja" and
            s.get("details", {}).get("avvVersion") == preview.AVV_VERSION and
            all(s["bundle"].get(k, {}).get("sha256") == h for k, h in preview.HASHES.items()),
            "firestore_documents_changed")
    require(s.get("downstream") == {"airtable":"disabled","proofPdf":"disabled","email":"disabled"},
            "unexpected_downstream_activation")
    require(f.get("Offertennummer") == preview.NUMBER and
            f.get("Online-Annahme Token-Hash") == preview.TOKEN_HASH and
            f.get("Lead E-Mail") == [EMAIL] and f.get("AVV erforderlich") == "Ja",
            "airtable_identity_changed")
    require(not any(f.get(k) is True for k in (
        "Echtbetrieb – kein Test", "Online-Annahme rechtlich freigegeben", "Versand freigegeben"
    )) and f.get("Online-Annahme Bestätigung gesendet am") is None,
            "unexpected_business_release_or_email")
    return s, f


def verify_accepted(s, f):
    e = s.get("evidence", {})
    require(s.get("status") == "accepted" and int(s.get("revision", 0)) >= 2 and
            e.get("name") == PERSON and e.get("email") == EMAIL and
            e.get("offer_number") == preview.NUMBER and
            e.get("accepted_at_utc") == s.get("acceptedAt") and
            all(e.get(k) is True for k in ("authorized_confirmed","quote_confirmed","terms_confirmed")) and
            e.get("avv_confirmed") is True and e.get("avv_required") is True and
            e.get("avv_version") == preview.AVV_VERSION and
            e.get("avv_pdf_sha256") == preview.HASHES["avv"] and
            e.get("quote_pdf_sha256") == preview.HASHES["quote"] and
            e.get("terms_pdf_sha256") == preview.HASHES["terms"], "firestore_acceptance_unconfirmed")
    print("PASS: Firestore-Annahme, Person, Zustimmungen und Dokumenthashes zurueckgelesen.")
    require(f.get("Status") == "Angenommen" and f.get("Vertragsunterlagen akzeptiert") is True and
            f.get("Online-Annahme Person") == PERSON and f.get("Online-Annahme E-Mail") == EMAIL and
            f.get("Online-Annahme Vertragsversion") == "TEST_v1.0_RC1" and
            f.get("Online-Annahme Offerten-SHA256") == preview.HASHES["quote"] and
            f.get("Online-Annahme Bedingungen-SHA256") == preview.HASHES["terms"] and
            f.get("Online-Annahme Offerten Drive ID") == s["bundle"]["quote"]["id"] and
            f.get("Online-Annahme Bedingungen Drive ID") == s["bundle"]["terms"]["id"] and
            f.get("Online-Annahme AVV ausdrücklich akzeptiert") is True and
            f.get("Online-Annahme AVV-Version") == preview.AVV_VERSION and
            f.get("Online-Annahme AVV-SHA256") == preview.HASHES["avv"] and
            f.get("Online-Annahme AVV Drive ID") == s["bundle"]["avv"]["id"],
            "airtable_acceptance_unconfirmed_manual_review")
    timestamp = lambda x: datetime.fromisoformat(x.replace("Z", "+00:00"))
    require(timestamp(f.get("Online-Annahme Zeitstempel", "")) == timestamp(s["acceptedAt"]),
            "airtable_acceptance_time_mismatch")
    print("PASS: Airtable-Status, Person, Zeitpunkt und PDF-Referenzen stimmen mit Firestore ueberein.")


def run(accept, code, google, airtable, identity):
    s, f = read_state(google, airtable)
    if not accept or s.get("status") == "accepted":
        verify_accepted(s, f)
        print("READBACK ONLY: keine erneute Annahme gesendet.")
        return
    require(s.get("status") == "sent" and f.get("Status") == "Entwurf" and
            f.get("Vertragsunterlagen akzeptiert") is not True, "test_offer_not_pending")
    # Previews/PDFs have already passed live. The server verifies them again
    # before committing; this client sends the exact independently checked hashes.
    payload = {
        "code": code, "name": PERSON, "email": EMAIL,
        "authorized": True, "accept_quote": True, "accept_terms": True,
        "quote_sha256": preview.HASHES["quote"], "terms_sha256": preview.HASHES["terms"],
        "accept_avv": True, "avv_sha256": preview.HASHES["avv"], "avv_version": preview.AVV_VERSION,
    }
    print("ACCEPT: genau eine synthetische Testannahme; kein Vertrag.", flush=True)
    try:
        result = api(preview.ORIGIN + "/api/offer/accept", identity, payload)
        require(result.get("ok") is True and result.get("accepted") is True and
                result.get("test_only") is True and result.get("offer_number") == preview.NUMBER and
                result.get("confirmation_email_pending") is False, "accept_response_unconfirmed")
        status = result.get("airtable_sync_status")
        print("HTTP-Annahme bestaetigt; Airtable:", status if status in (
            "synced","manual_review_required") else "unconfirmed")
    except (RuntimeError, OSError, ValueError):
        print("Annahme-Antwort unklar. Nur GET-Readback; KEIN zweiter POST.", flush=True)
    s, f = read_state(google, airtable)
    verify_accepted(s, f)
    print("PASS: echter Cloud-Run -> Firestore -> Airtable-Test abgeschlossen.")
    print("Keine Make-Ausfuehrung, keine E-Mail und kein echter Vertrag durch dieses Skript.")


def main():
    global FIRESTORE
    p = argparse.ArgumentParser()
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--accept-once", action="store_true")
    mode.add_argument("--readback", action="store_true")
    p.add_argument("--token-file")
    args = p.parse_args()
    code = preview.load_code(preview.token_path(args.token_file))
    FIRESTORE = FIRESTORE.rsplit("/", 1)[0] + "/" + preview.TOKEN_HASH
    google = credential(["auth","print-access-token"])
    airtable = credential(["secrets","versions","access","1",
                           "--secret=lszh-offer-cloud-e2e-airtable","--project=lszh-automations"])
    identity = credential(["auth","print-identity-token"]) if args.accept_once else None
    run(args.accept_once, code, google, airtable, identity)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired) as error:
        print("STOP:", str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        print("Keine Wiederholung der Annahme. Nur --readback oder gezielte Diagnose.")
        raise SystemExit(1)

