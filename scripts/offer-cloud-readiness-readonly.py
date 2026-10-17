#!/usr/bin/env python3
"""READ ONLY Cloud Run baseline guard. No secrets printed, no writes or deployments."""
import json
import subprocess
import sys
import unittest

PROJECT = "lszh-automations"
REGION = "europe-west6"
SERVICE = "lszh-offer-portal-staging"
REVISION = "lszh-offer-portal-staging-00004-qt7"
ACCOUNT = "lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com"


class GateError(Exception):
    pass


def verify(service, policy):
    ann = service.get("metadata", {}).get("annotations") or {}
    spec = service.get("spec", {}).get("template", {}).get("spec") or {}
    traffic = service.get("status", {}).get("traffic") or []
    if service.get("metadata", {}).get("name") != SERVICE:
        raise GateError("different_service")
    if ann.get("run.googleapis.com/ingress") != "internal":
        raise GateError("ingress_changed")
    if ann.get("run.googleapis.com/ingress-status") not in (None, "internal"):
        raise GateError("ingress_status_changed")
    if ann.get("run.googleapis.com/build-function-target") != "lszhPortalPreflight":
        raise GateError("preflight_replaced")
    if spec.get("serviceAccountName") != ACCOUNT:
        raise GateError("service_identity_changed")
    if len(traffic) != 1 or traffic[0].get("revisionName") != REVISION:
        raise GateError("revision_changed")
    if traffic[0].get("percent") != 100:
        raise GateError("traffic_changed")
    bindings = policy.get("bindings") or []
    if not isinstance(bindings, list):
        raise GateError("policy_format")
    for b in bindings:
        members = b.get("members") or []
        if not isinstance(members, list) or any(
            m in ("allUsers", "allAuthenticatedUsers") for m in members
        ):
            raise GateError("direct_public_binding")
    return True


def read(args):
    cmd = ["gcloud", *args, "--project=" + PROJECT, "--region=" + REGION,
           "--format=json"]
    return json.loads(subprocess.run(
        cmd, capture_output=True, text=True, timeout=30, check=True
    ).stdout)


class OfflineTests(unittest.TestCase):
    def setUp(self):
        self.service = {
            "metadata": {"name": SERVICE, "annotations": {
                "run.googleapis.com/ingress": "internal",
                "run.googleapis.com/ingress-status": "internal",
                "run.googleapis.com/build-function-target": "lszhPortalPreflight"}},
            "spec": {"template": {"spec": {"serviceAccountName": ACCOUNT}}},
            "status": {"traffic": [{"revisionName": REVISION, "percent": 100}]}
        }

    def test_valid(self):
        self.assertTrue(verify(self.service, {}))

    def test_public_binding_blocked(self):
        with self.assertRaises(GateError):
            verify(self.service, {"bindings": [
                {"role": "roles/run.invoker", "members": ["allUsers"]}]})

    def test_wrong_revision_blocked(self):
        self.service["status"]["traffic"][0]["revisionName"] = "other"
        with self.assertRaises(GateError):
            verify(self.service, {})

    def test_external_ingress_blocked(self):
        self.service["metadata"]["annotations"]["run.googleapis.com/ingress"] = "all"
        with self.assertRaises(GateError):
            verify(self.service, {})

    def test_wrong_service_identity_blocked(self):
        self.service["spec"]["template"]["spec"]["serviceAccountName"] = "other"
        with self.assertRaises(GateError):
            verify(self.service, {})

    def test_preflight_replaced_blocked(self):
        self.service["metadata"]["annotations"]["run.googleapis.com/build-function-target"] = "new"
        with self.assertRaises(GateError):
            verify(self.service, {})


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        unittest.main(argv=[sys.argv[0]], verbosity=1)
    elif len(sys.argv) == 1:
        try:
            service = read(["run", "services", "describe", SERVICE])
            policy = read(["run", "services", "get-iam-policy", SERVICE])
            verify(service, policy)
        except GateError as error:
            print("NO-GO: Cloud Run baseline changed (" + str(error) + ").")
            raise SystemExit(1)
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired,
                ValueError, TypeError, KeyError):
            print("NO-GO: could not verify the read-only Cloud Run baseline.")
            raise SystemExit(2)
        print("PASS: preflight revision, ingress and service identity unchanged.")
        print("PASS: no direct public IAM binding on the service.")
        print("NOTE: inherited IAM not evaluated; deployment is NOT authorised.")
    else:
        raise SystemExit("Usage: python3 scripts/offer-cloud-readiness-readonly.py [--self-test]")
