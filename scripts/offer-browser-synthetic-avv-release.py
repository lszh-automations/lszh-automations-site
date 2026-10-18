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
PREVIOUS = SERVICE + "-00008-json"
REVISION = SERVICE + "-00009-avv"
TAG = "cloud-e2e"
ORIGIN = "https://cloud-e2e---lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app"
SA = "lszh-offer-portal-staging@" + PROJECT + ".iam.gserviceaccount.com"
SOURCE = "e09a5b27ff105e0d3e1c2b6a9e3aa677bf05c4c0"
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
    try:
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        raise RuntimeError("invalid_json_from_gcloud: " + " ".join(args[:3])) from None


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
    tags = [t for t in s["status"].get("traffic", []) if t.get("tag") == TAG]
    require(len(tags) == 1 and tags[0].get("revisionName") == PREVIOUS
            and tags[0].get("url") == ORIGIN and tags[0].get("percent", 0) == 0,
            "previous_test_tag_changed")
    spec = s["spec"]["template"]["spec"]
    require(spec.get("serviceAccountName") == SA, "browser_template_changed")
    prior = cloud(["run", "revisions", "describe", PREVIOUS, "--region=" + REGION])
    prior_spec = prior["spec"]
    require(prior_spec.get("serviceAccountName") == SA, "previous_identity_changed")
    prior_container = prior_spec["containers"][0]
    prior_env = {e["name"]: e.get("value") for e in prior_container.get("env", [])}
    require(prior_env.get("LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID") == "recensIiczNGsoPeR",
            "previous_source_changed")
    require(spec["containers"][0].get("image") == prior_container.get("image") and
            "@sha256:" in prior_container.get("image", ""), "previous_test_image_changed")
    revisions = cloud(["run", "revisions", "list", "--service=" + SERVICE,
                       "--region=" + REGION])
    require(not any(r.get("metadata", {}).get("name") == REVISION for r in revisions),
            "test_revision_already_exists_inspect_before_retry")
    for secret in SECRETS.values():
        version = cloud(["secrets", "versions", "describe", "1", "--secret=" + secret])
        require(version.get("state") == "ENABLED", "secret_version_not_enabled")
        policy = cloud(["secrets", "get-iam-policy", secret])
        require(any(b.get("role") == "roles/secretmanager.secretAccessor"
                    and not b.get("condition")
                    and "serviceAccount:" + SA in b.get("members", [])
                    for b in policy.get("bindings", [])), "existing_secret_access_missing")
    cloud(["artifacts", "repositories", "describe", "cloud-run-source-deploy",
           "--location=" + REGION])
    p = cloud(["projects", "get-iam-policy", PROJECT])
    require(not any(b.get("role") in {"roles/run.invoker", "roles/run.admin",
                                     "roles/owner", "roles/editor"}
                    and set(b.get("members", [])) & {"allUsers", "allAuthenticatedUsers"}
                    for b in p.get("bindings", [])), "project_public_run_binding")
    print("PASS: baseline, direct/project public-Run checks, secrets metadata and registry.")
    print("PLAN: build tested source " + SOURCE)
    print("PLAN: retain existing identity and secret grants; replace only completed AVV-Nein test tag.")
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


def apply(resume_build=None):
    if resume_build is not None:
        require(re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", resume_build),
                "invalid_build_id")
        print("RESUME: reading existing build " + resume_build, flush=True)
        build = cloud(["builds", "describe", resume_build, "--region=" + REGION])
        require(build.get("id") == resume_build and build.get("projectId") == PROJECT,
                "resume_build_identity_mismatch")
        require(build.get("images") == [IMAGE], "resume_build_requested_image_mismatch")
    else:
        with tempfile.TemporaryDirectory(prefix="lszh-offer-e2e-") as d:
            stage = Path(d)
            package(stage)
            print("BUILD: isolated tested portal package; this may take several minutes.", flush=True)
            # Build-log streaming can pollute stdout despite --format=json.
            build = cloud(["builds", "submit", str(stage), "--region=" + REGION,
                           "--tag=" + IMAGE, "--suppress-logs"], timeout=1800)
    require(build.get("status") == "SUCCESS", "cloud_build_not_success")
    images = [i for i in build.get("results", {}).get("images", []) if i.get("name") == IMAGE]
    require(len(images) == 1 and re.fullmatch(r"sha256:[0-9a-f]{64}", images[0].get("digest", "")),
            "build_image_digest_missing")
    image = IMAGE.split(":")[0] + "@" + images[0]["digest"]
    # Recheck before mutating anything after a potentially lengthy build.
    check()
    env = {
        "GOOGLE_CLOUD_PROJECT": PROJECT,
        "LSZH_PORTAL_STAGING_ENABLED": "true",
        "LSZH_PORTAL_BROWSER_PILOT_ENABLED": "true",
        "LSZH_PORTAL_DATABASE": "lszh-offers-staging",
        "LSZH_PORTAL_ARCHIVE_FOLDER": "10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko",
        "LSZH_PORTAL_TERMS_VERSION": "TEST_v1.0_RC1",
        "LSZH_PORTAL_ORIGIN": ORIGIN,
        "LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED": "true",
        "LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID": "recktLXj5wUxLmHFQ",
        "LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED": "true",
        "LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED": "false",
        "LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED": "false",
        "LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED": "false",
        "LSZH_OFFER_TEMP_BUSINESS_FOLDER_PREFLIGHT": "false",
    }
    print("DEPLOY: " + REVISION + ", tag " + TAG + ", no normal traffic.", flush=True)
    cloud(["run", "deploy", SERVICE, "--region=" + REGION,
           "--image=" + image, "--service-account=" + SA,
           "--revision-suffix=00009-avv", "--no-traffic", "--tag=" + TAG,
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
    print("PASS: Deployment abgeschlossen; als Naechstes AVV-Vorschau pruefen.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--resume-build", metavar="BUILD_ID")
    args = parser.parse_args()
    try:
        check()
        if args.apply or args.resume_build:
            apply(args.resume_build)
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print("STOP:", error)
        print("Do not rerun --apply blindly. Existing build/grants/revision may need inspection.")
        raise SystemExit(1)

