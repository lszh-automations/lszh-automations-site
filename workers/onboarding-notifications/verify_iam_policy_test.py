#!/usr/bin/env python3
"""Offline synthetic policy tests; no gcloud needed."""
import importlib.util
from pathlib import Path
import unittest

module_spec = importlib.util.spec_from_file_location(
    "verify_iam_policy", Path(__file__).with_name("verify_iam_policy.py")
)
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)


def binding(role="roles/datastore.user", condition=True):
    value = {"role": role, "members": [module.ACCOUNT]}
    if condition:
        value["condition"] = {
            "title": module.TITLE, "expression": module.EXPRESSION
        }
    return value


class TestIAMPolicy(unittest.TestCase):
    def test_correct_conditional_binding(self):
        self.assertEqual(module.assess_policy({"bindings": [binding()]}), [])

    def test_unconditional_extra_datastore_role_is_blocked(self):
        errors = module.assess_policy({"bindings": [binding(), binding(condition=False)]})
        self.assertTrue(any("Unexpected" in e for e in errors))

    def test_wrong_database_condition_is_blocked(self):
        altered = binding()
        altered["condition"]["expression"] = (
            'resource.name=="projects/lszh-automations/databases/(default)"'
        )
        self.assertTrue(module.assess_policy({"bindings": [altered]}))

    def test_unexpected_project_editor_grant_is_blocked(self):
        self.assertTrue(module.assess_policy({"bindings": [binding(), binding("roles/editor")]}))

    def test_duplicate_conditional_bindings_fail(self):
        self.assertTrue(module.assess_policy({"bindings": [binding(), binding()]}))

    def test_absent_account_fails(self):
        self.assertTrue(module.assess_policy({"bindings": [
            {"role": "roles/datastore.user", "members": ["user:someone@example.invalid"]}
        ]}))

    def test_unrelated_other_members_do_not_fail(self):
        self.assertEqual(module.assess_policy({"bindings": [
            binding(),
            {"role": "roles/owner", "members": ["user:someone@example.invalid"]}
        ]}), [])

    def test_invalid_policy_fails_closed(self):
        self.assertTrue(module.assess_policy({"bindings": None}))


if __name__ == "__main__":
    unittest.main()
