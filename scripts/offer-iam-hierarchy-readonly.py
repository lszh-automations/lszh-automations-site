#!/usr/bin/env python3
"""Investigative, READ-ONLY inherited IAM inventory for LSZH Cloud project.

All operations are gcloud GET/list commands. No membership or IAM policy data
is logged; only counts of potential public access and unsupported constructs.
This CANNOT prove effective permissions, including custom-role contents,
service agents, IAM Conditions, IAM Deny/PAB or resource-specific bindings.
Never use this script as go-live authorisation.
"""
import json
import subprocess
import sys
import unittest

PROJECT = "lszh-automations"
ACCOUNT = "lars@lszh-automations.ch"
PUBLIC = {"allUsers", "allAuthenticatedUsers"}


class GateError(Exception):
    pass


def audit_policy_hierarchy(document):
    """Inspect nested allow-policy bindings without disclosing IAM principals."""
    if not isinstance(document, (list, dict)) or not document:
        raise GateError("unrecognized_or_empty_hierarchy")
    counts = {"records": 0, "bindings": 0, "public": 0, "conditional": 0,
              "custom": 0, "unknown_bindings": 0}

    def recurse(obj, depth=0):
        if depth > 30:
            raise GateError("hierarchy_too_deep")
        if isinstance(obj, list):
            for item in obj:
                recurse(item, depth + 1)
            return
        if not isinstance(obj, dict):
            return
        for key, val in obj.items():
            if key in ("bindings", "allowBindings"):
                counts["records"] += 1
                if not isinstance(val, list):
                    raise GateError("bindings_format_invalid")
                for binding in val:
                    if not isinstance(binding, dict):
                        raise GateError("binding_not_object")
                    counts["bindings"] += 1
                    members = binding.get("members", binding.get("principals"))
                    if not isinstance(members, list) or any(
                        not isinstance(member, str) for member in members
                    ):
                        counts["unknown_bindings"] += 1
                        continue
                    if PUBLIC.intersection(members):
                        counts["public"] += 1
                    role = binding.get("role", "")
                    if not isinstance(role, str) or not role.startswith("roles/"):
                        counts["custom"] += 1
                    if binding.get("condition") is not None:
                        counts["conditional"] += 1
            else:
                recurse(val, depth + 1)

    recurse(document)
    if counts["records"] == 0:
        raise GateError("no_parseable_allow_policy_sections")
    return counts


def classify_gcloud_failure(stderr):
    """Return fixed, non-sensitive categories; NEVER surface raw stderr."""
    message = (stderr or "").lower()
    if any(x in message for x in (
            "permission_denied", "permission denied", "does not have permission",
            "not authorized", "403", "insufficient authentication scopes")):
        return "IAM_READ_PERMISSION_DENIED"
    if any(x in message for x in (
            "invalid choice", "unrecognized arguments", "unknown command",
            "command not found", "not a valid choice")):
        return "GCLOUD_COMMAND_OR_FLAG_UNAVAILABLE"
    if any(x in message for x in (
            "please run", "login required", "invalid_grant",
            "unauthenticated", "no active account", "401")):
        return "CLOUD_LOGIN_REQUIRED"
    if any(x in message for x in (
            "api has not been used", "api is disabled", "service disabled")):
        return "RESOURCE_MANAGER_API_UNAVAILABLE"
    if any(x in message for x in (
            "not found", "notfound", "404")):
        return "PROJECT_NOT_VISIBLE"
    return "GOOGLE_CLOUD_QUERY_FAILED"


def run_gcloud(command):
    result = subprocess.run(["gcloud", *command, "--format=json"],
                            check=False, capture_output=True, text=True,
                            timeout=90)
    if result.returncode != 0:
        raise GateError(classify_gcloud_failure(result.stderr))
    try:
        data = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise GateError("GCLOUD_RESULT_NOT_JSON") from None
    if not isinstance(data, (list, dict)):
        raise GateError("GCLOUD_RESULT_UNEXPECTED_SHAPE")
    return data


def run():
    account = subprocess.run(["gcloud", "config", "get-value", "account"],
                             check=True, capture_output=True, text=True,
                             timeout=15).stdout.strip()
    if account != ACCOUNT:
        raise GateError("business_cloud_account_required")
    # Official resource manager ancestry command; read-only and includes Deny
    # resources for later manual review. Never print its raw policy payload.
    raw = run_gcloud(["projects", "get-ancestors-iam-policy",
                      PROJECT, "--include-deny"])
    counts = audit_policy_hierarchy(raw)
    print("READ-ONLY IAM hierarchy policy inventory:")
    print("  policy sections inspected:", counts["records"])
    print("  allow bindings seen:", counts["bindings"])
    print("  direct or inherited public bindings seen:", counts["public"])
    print("  bindings with conditions:", counts["conditional"])
    print("  nonstandard or custom-role bindings:", counts["custom"])
    print("  incomplete binding structures:", counts["unknown_bindings"])
    print("NOTE: No principal names, group addresses or policy content displayed.")
    print("NOTE: This is NOT an effective-permission calculation or production approval.")
    if counts["public"] or counts["unknown_bindings"]:
        print("NO-GO: public/unknown inherited policy entries need manual IAM review.")
        return 1
    print("INVESTIGATION ONLY: no obvious public bindings in readable allow sections.")
    print("REVIEW REQUIRED: custom roles, conditions, IAM Deny/PAB, service IAM,"
          " Google Groups and effective invocation require separate verification.")
    return 0


class Tests(unittest.TestCase):
    def test_gcloud_diagnostic_only_fixed_codes_never_echo_identity(self):
        cases = [
            ("PERMISSION_DENIED: roles/iam.securityReviewer needed for "
             "user:private@example.invalid", "IAM_READ_PERMISSION_DENIED"),
            ("unrecognized arguments: --include-deny",
             "GCLOUD_COMMAND_OR_FLAG_UNAVAILABLE"),
            ("Please run gcloud auth login", "CLOUD_LOGIN_REQUIRED"),
            ("API has not been used in project", "RESOURCE_MANAGER_API_UNAVAILABLE"),
            ("Resource not found: organizations/999", "PROJECT_NOT_VISIBLE"),
            ("Unexpected provider text: token=FAKE_NOT_A_TOKEN",
             "GOOGLE_CLOUD_QUERY_FAILED")
        ]
        for raw, expected in cases:
            result = classify_gcloud_failure(raw)
            self.assertEqual(result, expected)
            self.assertNotIn("private@", result)
            self.assertNotIn("organizations/", result)
            self.assertNotIn("token=", result)

    def test_invalid_json_and_unreadable_ancestry_is_no_go(self):
        from unittest.mock import patch
        good = subprocess.CompletedProcess([], 0, stdout="not JSON", stderr="")
        failed = subprocess.CompletedProcess([], 1, stdout="", stderr="PERMISSION_DENIED")
        with patch("subprocess.run", return_value=good):
            with self.assertRaisesRegex(GateError, "GCLOUD_RESULT_NOT_JSON"):
                run_gcloud(["projects", "get-ancestors-iam-policy", PROJECT])
        with patch("subprocess.run", return_value=failed):
            with self.assertRaisesRegex(GateError, "IAM_READ_PERMISSION_DENIED"):
                run_gcloud(["projects", "get-ancestors-iam-policy", PROJECT])

    def test_project_and_ancestors(self):
        policies = [{"resource": "organizations/123", "policy": {
            "bindings": [{"role": "roles/viewer", "members": ["user:synthetic@example.invalid"]}]}},
            {"resource": "folders/456", "policy": {
                "bindings": [{"role": "roles/run.invoker", "members": ["group:test@example.invalid"]}]}},
            {"resource": "projects/example", "policy": {"bindings": []}}]
        result = audit_policy_hierarchy(policies)
        self.assertEqual((result["records"], result["bindings"], result["public"]), (3, 2, 0))

    def test_public_at_any_parent_is_detected(self):
        for principal in PUBLIC:
            out = audit_policy_hierarchy([{"policy": {"bindings": [
                {"role": "roles/run.invoker", "members": [principal]}]}}])
            self.assertEqual(out["public"], 1)

    def test_conditional_custom_and_unknown_never_hidden(self):
        out = audit_policy_hierarchy({"policy": {"bindings": [
            {"role": "organizations/123/roles/MyCustomRole",
             "members": ["group:synthetic@example.invalid"],
             "condition": {"expression": "false"}},
            {"role": "roles/run.invoker", "members": None}
        ]}})
        self.assertEqual((out["custom"], out["conditional"], out["unknown_bindings"]), (1, 1, 1))

    def test_malformed_and_missing_hierarchy_is_no_go(self):
        for bad in (None, [], {}, "ignored", [{"resource": "projects/123"}],
                    {"bindings": "not-a-list"}, {"bindings": [42]}):
            with self.assertRaises(GateError):
                audit_policy_hierarchy(bad)

    def test_empty_visible_policies_not_falsely_prove_security(self):
        counts = audit_policy_hierarchy([{"policy": {"bindings": []}}])
        self.assertEqual(counts["public"], 0)
        self.assertEqual(counts["records"], 1)
        # The operator still gets INVESTIGATION ONLY rather than a GO-LIVE result.


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        unittest.main(argv=[sys.argv[0]], verbosity=1)
    elif not sys.argv[1:]:
        try:
            raise SystemExit(run())
        except GateError as error:
            # Only GateError-coded known reasons; never print gcloud stderr.
            reason = str(error)
            reasons = {
                "business_cloud_account_required",
                "unrecognized_or_empty_hierarchy", "hierarchy_too_deep",
                "bindings_format_invalid", "binding_not_object",
                "no_parseable_allow_policy_sections",
                "IAM_READ_PERMISSION_DENIED", "GCLOUD_COMMAND_OR_FLAG_UNAVAILABLE",
                "CLOUD_LOGIN_REQUIRED", "RESOURCE_MANAGER_API_UNAVAILABLE",
                "PROJECT_NOT_VISIBLE", "GOOGLE_CLOUD_QUERY_FAILED",
                "GCLOUD_RESULT_NOT_JSON", "GCLOUD_RESULT_UNEXPECTED_SHAPE"
            }
            print("NO-GO: IAM hierarchy diagnosis:", reason if reason in reasons else "UNKNOWN_VALIDATION_ERROR")
            raise SystemExit(2)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
                OSError, json.JSONDecodeError, ValueError, TypeError):
            print("NO-GO: IAM ancestry inaccessible or returned unexpected data.")
            raise SystemExit(2)
    else:
        print("Usage: python3 scripts/offer-iam-hierarchy-readonly.py [--self-test]")
        raise SystemExit(2)
