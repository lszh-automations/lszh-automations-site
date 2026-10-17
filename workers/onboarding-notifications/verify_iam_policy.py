#!/usr/bin/env python3
"""Read-only, least-privilege IAM policy analysis for LSZH synthetic STAGING.

Reads gcloud projects get-iam-policy --format=json on stdin.
Reports ONLY findings about the dedicated outbox service account.
Does not prove effective REST API access or inherited IAM grants.
"""
import json
import sys

ACCOUNT = "serviceAccount:lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com"
ROLE = "roles/datastore.user"
EXPRESSION = 'resource.name=="projects/lszh-automations/databases/lszh-offers-staging"'
TITLE = "LSZHOutboxSyntheticStaging"


def assess_policy(policy):
    if not isinstance(policy, dict) or not isinstance(policy.get("bindings"), list):
        return ["IAM policy JSON invalid or missing bindings"]
    valid = 0
    errors = []
    for binding in policy["bindings"]:
        if not isinstance(binding, dict):
            errors.append("Invalid binding structure")
            continue
        if ACCOUNT not in binding.get("members", []):
            continue
        cond = binding.get("condition") or {}
        if (binding.get("role") == ROLE and isinstance(cond, dict)
                and cond.get("expression") == EXPRESSION
                and cond.get("title") == TITLE):
            valid += 1
        else:
            errors.append(
                "Unexpected project-level role or unscoped/different condition: "
                + str(binding.get("role", "(unknown)"))
            )
    if valid != 1:
        errors.append(
            "Expected exactly one datastore.user binding with exact named-database condition; "
            f"observed {valid}"
        )
    return errors


def main():
    try:
        policy = json.load(sys.stdin)
    except (ValueError, UnicodeDecodeError) as error:
        print("FAIL: IAM JSON could not be read:", str(error), file=sys.stderr)
        return 2
    issues = assess_policy(policy)
    if issues:
        for issue in issues:
            print("FAIL: " + issue)
        return 2
    print("PASS: One database-scoped roles/datastore.user project IAM binding is present.")
    print("PASS: No additional project IAM bindings were found for this identity.")
    print("NOTE: Inherited IAM grants and actual Firestore REST permissions are NOT verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
