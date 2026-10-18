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


def run_gcloud(command):
    result = subprocess.run(["gcloud", *command, "--format=json"],
                            check=True, capture_output=True, text=True,
                            timeout=90)
    return json.loads(result.stdout)


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
        except GateError:
            print("NO-GO: business IAM ancestry audit incomplete or unsafe.")
            raise SystemExit(2)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
                OSError, json.JSONDecodeError, ValueError, TypeError):
            print("NO-GO: IAM ancestry inaccessible or returned unexpected data.")
            raise SystemExit(2)
    else:
        print("Usage: python3 scripts/offer-iam-hierarchy-readonly.py [--self-test]")
        raise SystemExit(2)
