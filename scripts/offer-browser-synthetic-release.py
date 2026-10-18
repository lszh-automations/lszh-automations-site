#!/usr/bin/env python3
"""Operator-run synthetic browser revision. --check reads; --apply builds/deploys.
No offer acceptance, data seeding, Make action or email is performed.
"""
import argparse
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

PROJECT = "lszh-automations"
REGION = "europe-west6"
USER = "lars@lszh-automations.ch"
SERVICE = "lszh-offer-browser-staging"
BASELINE = SERVICE + "-00006-h5w"
REVISION = SERVICE + "-00007-e2e"
TAG = "cloud-e2e"
ORIGIN = "https://cloud-e2e---lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app"
SA = "lszh-offer-portal-staging@" + PROJECT + ".iam.gserviceaccount.com"
SOURCE = "f19e73362b63380460f3c552bf5dd8ebaa9f11ce"
IMAGE = REGION + "-docker.pkg.dev/" + PROJECT + "/cloud-run-source-deploy/lszh-offer-browser-staging:e2e-" + SOURCE[:12]
SECRETS = {
    "LSZH_AIRTABLE_ACCESS_TOKEN": "lszh-offer-cloud-e2e-airtable",
    "LSZH_PORTAL_PROOF_SALT": "lszh-offer-cloud-e2e-proof-salt",
}
ROOT = Path(__file__).resolve().parents[1]


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def command(args, timeout=90):
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        # Commands contain no secret values. Never read secret payloads here.
        print(r.stderr[-4000:])
        raise RuntimeError("command_failed: " + " ".join(args[:4]))
    return r.stdout


def cloud(args, timeout=90):
    raw = command(["gcloud", *args, "--project=" + PROJECT,
                   "--account=" + USER, "--format=json", "--quiet"], timeout)
    return json.loads(raw) if raw.strip() else {}


def service(name):
    return cloud(["run", "services", "describe", name, "--region=" + REGION])


def traffic(data):
    return {t["revisionName"]: t.get("percent", 0)
            for t in data.get("status", {}).get("traffic", []) if t.get("percent", 0)}


def protected_portal():
    s = service("lszh-offer-portal-staging")
    require(s["metadata"]["annotations"].get("run.googleapis.com/ingress") == "internal",
            "original_ingress_changed")
    require(traffic(s) == {"lszh-offer-portal-staging-00004-qt7": 100},
            "original_traffic_changed")


def private_service(s):
    a = s["metadata"].get("annotations", {})
    require(a.get("run.googleapis.com/ingress") == "all", "browser_ingress_changed")
    require(a.get("run.googleapis.com/invoker-iam-disabled", "false") == "false",
            "iam_invoker_disabled")
    p = cloud(["run", "services", "get-iam-policy", SERVICE, "--region=" + REGION])
    require(not any(set(b.get("members", [])) & {"allUsers", "allAuthenticatedUsers"}
                    for b in p.get("bindings", [])), "direct_public_binding")
    # The already-authorized operator must retain explicit invoke permission.
    require(any(b.get("role") == "roles/run.invoker" and not b.get("condition")
                and "user:" + USER in b.get("members", []) for b in p.get("bindings", [])),
            "operator_invoker_missing")


def check():
    require(shutil.which("gcloud") and shutil.which("git"), "gcloud_or_git_missing")
    command(["git", "cat-file", "-e", SOURCE + "^{commit}"])
    protected_portal()
    s = service(SERVICE)
    private_service(s)
    require(traffic(s) == {BASELINE: 100}, "browser_traffic_changed")
    require(not any(t.get("tag") == TAG for t in s["status"].get("traffic", [])),
            "test_tag_already_exists_do_not_repeat")
    require(s["spec"]["template"]["spec"].get("serviceAccountName") ==
            "lszh-offer-browser-tmp@" + PROJECT + ".iam.gserviceaccount.com",
            "browser_template_changed")
    revisions = cloud(["run", "revisions", "list", "--service=" + SERVICE,
                       "--region=" + REGION])
    require(not any(r.get("metadata", {}).get("name") == REVISION for r in revisions),
            "test_revision_already_exists_inspect_before_retry")
    for secret in SECRETS.values():
        version = cloud(["secrets", "versions", "describe", "1", "--secret=" + secret])
        require(version.get("state") == "ENABLED", "secret_version_not_enabled")
    cloud(["artifacts", "repositories", "describe", "cloud-run-source-deploy",
           "--location=" + REGION])
    p = cloud(["projects", "get-iam-policy", PROJECT])
    require(not any(b.get("role") in {"roles/run.invoker", "roles/run.admin",
                                     "roles/owner", "roles/editor"}
                    and set(b.get("members", [])) & {"allUsers", "allAuthenticatedUsers"}
                    for b in p.get("bindings", [])), "project_public_run_binding")
    print("PASS: baseline, direct/project public-Run checks, secrets metadata and registry.")
    print("PLAN: build tested source " + SOURCE)
    print("PLAN: two secret-scoped access grants to existing portal identity.")
    print("PLAN: tagged private browser revision; old demo retains 100% normal traffic.")
    print("PLAN: no source seed, acceptance POST, Make execution or email.")


def package(stage):
    # Export only the tested code, not local secrets or unreviewed working files.
    files = command(["git", "ls-tree", "-r", "--name-only", SOURCE]).splitlines()
    chosen = [p for p in files if
              (p.startswith("cloud-run/offer-portal-staging/") and
               (p.endswith(".mjs") or p.endswith("/package.json"))) or
              p in {"cloud-run/archive-reader-staging/archiveBundleVerifier.mjs",
                    "offerte-annehmen/index.html"}]
    require(len(chosen) >= 5, "source_package_incomplete")
    for name in chosen:
        dest = stage / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(command(["git", "show", SOURCE + ":" + name]))
    (stage / "Dockerfile").write_text(command([
        "git", "show", SOURCE + ":cloud-run/Dockerfile.offer-portal-staging"]))


def apply():
    with tempfile.TemporaryDirectory(prefix="lszh-offer-e2e-") as d:
        stage = Path(d)
        package(stage)
        print("BUILD: isolated tested portal package; this may take several minutes.", flush=True)
        build = cloud(["builds", "submit", str(stage), "--region=" + REGION,
                       "--tag=" + IMAGE], timeout=1800)
    require(build.get("status") == "SUCCESS", "cloud_build_not_success")
    images = [i for i in build.get("results", {}).get("images", []) if i.get("name") == IMAGE]
    require(len(images) == 1 and re.fullmatch(r"sha256:[0-9a-f]{64}", images[0].get("digest", "")),
            "build_image_digest_missing")
    image = IMAGE.split(":")[0] + "@" + images[0]["digest"]
    # Recheck before mutating anything after a potentially lengthy build.
    check()
    for secret in SECRETS.values():
        cloud(["secrets", "add-iam-policy-binding", secret,
               "--member=serviceAccount:" + SA,
               "--role=roles/secretmanager.secretAccessor", "--condition=None"])
    env = {
        "GOOGLE_CLOUD_PROJECT": PROJECT,
        "LSZH_PORTAL_STAGING_ENABLED": "true",
        "LSZH_PORTAL_BROWSER_PILOT_ENABLED": "true",
        "LSZH_PORTAL_DATABASE": "lszh-offers-staging",
        "LSZH_PORTAL_ARCHIVE_FOLDER": "10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko",
        "LSZH_PORTAL_TERMS_VERSION": "TEST_v1.0_RC1",
        "LSZH_PORTAL_ORIGIN": ORIGIN,
        "LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED": "true",
        "LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID": "recensIiczNGsoPeR",
        "LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED": "true",
        "LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED": "false",
        "LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED": "false",
        "LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED": "false",
        "LSZH_OFFER_TEMP_BUSINESS_FOLDER_PREFLIGHT": "false",
    }
    print("DEPLOY: " + REVISION + ", tag " + TAG + ", no normal traffic.", flush=True)
    cloud(["run", "deploy", SERVICE, "--region=" + REGION,
           "--image=" + image, "--service-account=" + SA,
           "--revision-suffix=00007-e2e", "--no-traffic", "--tag=" + TAG,
           "--invoker-iam-check",
           "--set-env-vars=" + ",".join(k + "=" + v for k, v in env.items()),
           "--set-secrets=" + ",".join(k + "=" + v + ":1" for k, v in SECRETS.items()),
           "--min-instances=0", "--max-instances=1", "--concurrency=1",
           "--memory=512Mi", "--cpu=1", "--timeout=60"], timeout=900)
    s = service(SERVICE)
    private_service(s)
    require(traffic(s) == {BASELINE: 100}, "postdeploy_traffic_mismatch")
    tags = [t for t in s["status"].get("traffic", []) if t.get("tag") == TAG]
    require(len(tags) == 1 and tags[0].get("revisionName") == REVISION
            and tags[0].get("url") == ORIGIN and tags[0].get("percent", 0) == 0,
            "postdeploy_tag_mismatch")
    revision = cloud(["run", "revisions", "describe", REVISION, "--region=" + REGION])
    spec = revision["spec"]
    require(spec.get("serviceAccountName") == SA, "postdeploy_identity_mismatch")
    require(any(c.get("type") == "Ready" and c.get("status") == "True"
                for c in revision.get("status", {}).get("conditions", [])),
            "test_revision_not_ready")
    container = spec["containers"][0]
    actual = {e["name"]: e.get("value") for e in container.get("env", [])}
    require(all(actual.get(k) == v for k, v in env.items()), "postdeploy_env_mismatch")
    secret_env = {e["name"]: e.get("valueFrom", {}).get("secretKeyRef", {})
                  for e in container.get("env", []) if e.get("valueFrom")}
    require(all(secret_env.get(k) == {"name": v, "key": "1"} for k, v in SECRETS.items()),
            "postdeploy_secret_reference_mismatch")
    require(container.get("image") == image, "postdeploy_image_mismatch")
    protected_portal()
    print("PASS: tagged revision ready; original portal and 100% demo traffic preserved.")
    print("TEST URL: " + ORIGIN)
    print("STOP: no offer accepted. Return these results before the single acceptance test.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        check()
        if args.apply:
            apply()
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print("STOP:", error)
        print("Do not rerun --apply blindly. Existing build/grants/revision may need inspection.")
        raise SystemExit(1)
