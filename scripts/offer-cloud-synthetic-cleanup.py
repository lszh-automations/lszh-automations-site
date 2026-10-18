#!/usr/bin/env python3
"""Remove only the completed LSZH synthetic Cloud Run test revisions and grants."""
import json
import subprocess
import sys

PROJECT = "lszh-automations"
REGION = "europe-west6"
ACCOUNT = "lars@lszh-automations.ch"
SERVICE = "lszh-offer-browser-staging"
PORTAL = "lszh-offer-portal-staging"
BASELINE = "lszh-offer-browser-staging-00006-h5w"
PORTAL_BASELINE = "lszh-offer-portal-staging-00004-qt7"
TAG = "cloud-e2e"
TAGGED_REVISION = "lszh-offer-browser-staging-00009-avv"
REVISIONS = (
    "lszh-offer-browser-staging-00007-e2e",
    "lszh-offer-browser-staging-00008-json",
    "lszh-offer-browser-staging-00009-avv",
)
SA = "serviceAccount:lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com"
SECRETS = ("lszh-offer-cloud-e2e-airtable", "lszh-offer-cloud-e2e-proof-salt")
ROLE = "roles/secretmanager.secretAccessor"


def fail(code):
    raise RuntimeError("CLOUD_E2E_CLEANUP_STOP:" + code)


def gcloud(args):
    result = subprocess.run(
        ["gcloud", *args, "--project=" + PROJECT, "--account=" + ACCOUNT,
         "--quiet", "--format=json"],
        capture_output=True, text=True, timeout=90,
    )
    if result.returncode:
        fail("gcloud_" + (args[0] if args else "command") + "_failed")
    try:
        return json.loads(result.stdout) if result.stdout.strip() else {}
    except ValueError:
        fail("gcloud_json_invalid")


def configured_value(key):
    result = subprocess.run(
        ["gcloud", "config", "get-value", key, "--project=" + PROJECT,
         "--account=" + ACCOUNT, "--quiet"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode:
        fail("gcloud_config_read_failed")
    return result.stdout.strip()


def traffic(service):
    return {
        row.get("revisionName"): row.get("percent", 0)
        for row in service.get("status", {}).get("traffic", [])
        if row.get("percent", 0)
    }


def service(name):
    return gcloud(["run", "services", "describe", name, "--region=" + REGION])


def verify_baselines():
    portal = service(PORTAL)
    if portal.get("metadata", {}).get("annotations", {}).get(
        "run.googleapis.com/ingress"
    ) != "internal" or traffic(portal) != {PORTAL_BASELINE: 100}:
        fail("portal_baseline_drift")
    app = service(SERVICE)
    annotations = app.get("metadata", {}).get("annotations", {})
    if annotations.get("run.googleapis.com/ingress") != "all":
        fail("browser_ingress_drift")
    if annotations.get("run.googleapis.com/invoker-iam-disabled", "false") != "false":
        fail("browser_invoker_iam_drift")
    if traffic(app) != {BASELINE: 100}:
        fail("browser_traffic_drift")
    tags = [
        row for row in app.get("status", {}).get("traffic", [])
        if row.get("tag") == TAG
    ]
    if len(tags) != 1 or tags[0].get("revisionName") != TAGGED_REVISION:
        fail("cloud_e2e_tag_drift")
    if tags[0].get("percent", 0) != 0:
        fail("cloud_e2e_tag_receives_traffic")
    revision_list = gcloud([
        "run", "revisions", "list", "--service=" + SERVICE, "--region=" + REGION
    ])
    names = {x.get("metadata", {}).get("name") for x in revision_list}
    if not set(REVISIONS).issubset(names):
        fail("expected_test_revision_missing")
    for secret in SECRETS:
        policy = gcloud(["secrets", "get-iam-policy", secret])
        grants = [
            binding for binding in policy.get("bindings", [])
            if binding.get("role") == ROLE and SA in binding.get("members", [])
        ]
        if len(grants) != 1 or grants[0].get("condition"):
            fail("expected_unconditional_test_secret_grant_missing:" + secret)


def main():
    if configured_value("account") != ACCOUNT:
        fail("wrong_active_account")
    if configured_value("project") != PROJECT:
        fail("wrong_active_project")
    verify_baselines()
    print("PASS: exact test tag/revisions and two test grants identified.", flush=True)
    print("PASS: original portal and browser demo still have 100% traffic.", flush=True)

    result = subprocess.run([
        "gcloud", "run", "services", "update-traffic", SERVICE,
        "--region=" + REGION, "--remove-tags=" + TAG,
        "--project=" + PROJECT, "--account=" + ACCOUNT, "--quiet",
    ], capture_output=True, text=True, timeout=120)
    if result.returncode:
        fail("tag_removal_failed")
    app = service(SERVICE)
    if traffic(app) != {BASELINE: 100} or any(
        row.get("tag") == TAG for row in app.get("status", {}).get("traffic", [])
    ):
        fail("post_tag_removal_traffic_mismatch")
    print("PASS: cloud-e2e tag removed; browser demo remains at 100%.", flush=True)

    for revision in REVISIONS:
        app = service(SERVICE)
        if traffic(app) != {BASELINE: 100}:
            fail("traffic_changed_before_revision_delete")
        if any(row.get("revisionName") == revision and row.get("percent", 0)
               for row in app.get("status", {}).get("traffic", [])):
            fail("test_revision_receives_traffic:" + revision)
        result = subprocess.run([
            "gcloud", "run", "revisions", "delete", revision,
            "--region=" + REGION, "--project=" + PROJECT,
            "--account=" + ACCOUNT, "--quiet",
        ], capture_output=True, text=True, timeout=120)
        if result.returncode:
            fail("revision_delete_failed:" + revision)
    if traffic(service(SERVICE)) != {BASELINE: 100}:
        fail("post_revision_cleanup_traffic_mismatch")
    print("PASS: only the three pinned no-traffic test revisions deleted.", flush=True)

    for secret in SECRETS:
        result = subprocess.run([
            "gcloud", "secrets", "remove-iam-policy-binding", secret,
            "--member=" + SA, "--role=" + ROLE, "--project=" + PROJECT,
            "--account=" + ACCOUNT, "--quiet",
        ], capture_output=True, text=True, timeout=90)
        if result.returncode:
            fail("secret_grant_removal_failed:" + secret)
        policy = gcloud(["secrets", "get-iam-policy", secret])
        if any(binding.get("role") == ROLE and SA in binding.get("members", [])
               for binding in policy.get("bindings", [])):
            fail("secret_grant_still_present:" + secret)
    verify_original_traffic()
    print("PASS: exact two temporary secret grants removed.", flush=True)
    print("PASS: original portal and 100% browser demo preserved; cleanup complete.")


def verify_original_traffic():
    if traffic(service(PORTAL)) != {PORTAL_BASELINE: 100}:
        fail("final_portal_traffic_mismatch")
    if traffic(service(SERVICE)) != {BASELINE: 100}:
        fail("final_browser_traffic_mismatch")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print("STOP:", error if isinstance(error, RuntimeError) else type(error).__name__)
        print("State may be partially cleaned. Inspect live state before any retry.")
        sys.exit(1)

