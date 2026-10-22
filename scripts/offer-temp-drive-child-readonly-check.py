#!/usr/bin/env python3
"""Read-only, fail-closed check of exactly the business-owned synthetic PDF folder.

This script never grants or updates Drive permissions, and never calls Cloud
Run, Firestore or any customer workflow. It reuses tested Drive validators
without invoking the original revision-pinned grant workflow.
"""
import argparse
from pathlib import Path
import runpy
import sys
import unittest

FOLDER_ID = "10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko"


class GateError(Exception):
    pass


def check_folder(folder, *, token_getter, urls, api, verify_folder, verify_list):
    if folder != FOLDER_ID:
        raise GateError("wrong_synthetic_folder")
    token = token_getter()
    meta_url, list_url, _ = urls(folder)
    metadata = api(token, "GET", meta_url)
    if verify_folder(metadata, folder) is not True:
        raise GateError("temporary_reader_absent")
    listing = api(token, "GET", list_url)
    if verify_list(listing, folder) is not True:
        raise GateError("four_pdf_set_invalid")
    return True


def live(folder):
    # run_path does not enter the previous grant script's __main__.
    old = runpy.run_path(str(Path(__file__).with_name(
        "offer-temp-drive-folder-reader.py")))
    checks = {
        "token_getter": old["get_token"],
        "urls": old["urls"],
        "api": old["api"],
        "verify_folder": old["verify_folder"],
        "verify_list": old["verify_list"],
    }
    if check_folder(folder, **checks) is not True:
        raise GateError("unverified_synthetic_test_folder")
    print("PASS: business-only Drive test folder, four PDFs and temporary Reader confirmed by GET-only checks.")


class Tests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.outcomes = ["folder", "files"]
        self.reader = True
        self.list_valid = True

    def dependencies(self):
        def api(token, method, url):
            self.requests.append((token, method, url))
            if method != "GET":
                raise AssertionError("no_write_allowed")
            if url == "META":
                return {"marker": "folder"}
            if url == "LIST":
                return {"marker": "files"}
            raise AssertionError("unexpected_url")
        return {
            "token_getter": lambda: "synthetic-not-an-access-token",
            "urls": lambda _: ("META", "LIST", "PERMISSION_CREATE_MUST_NEVER_BE_CALLED"),
            "api": api,
            "verify_folder": lambda obj, _: self.reader and obj.get("marker") == "folder",
            "verify_list": lambda obj, _: self.list_valid and obj.get("marker") == "files",
        }

    def test_success_exact_two_gets_and_no_create(self):
        self.assertTrue(check_folder(FOLDER_ID, **self.dependencies()))
        self.assertEqual([x[1] for x in self.requests], ["GET", "GET"])
        self.assertEqual([x[2] for x in self.requests], ["META", "LIST"])

    def test_wrong_folder_fails_without_api(self):
        with self.assertRaisesRegex(GateError, "wrong_synthetic_folder"):
            check_folder("1WRONG_FOLDER_123456789012345", **self.dependencies())
        self.assertEqual(self.requests, [])

    def test_missing_scoped_reader_fails_before_listing(self):
        self.reader = False
        with self.assertRaisesRegex(GateError, "temporary_reader_absent"):
            check_folder(FOLDER_ID, **self.dependencies())
        self.assertEqual([x[2] for x in self.requests], ["META"])

    def test_wrong_pdf_set_fails(self):
        self.list_valid = False
        with self.assertRaisesRegex(GateError, "four_pdf_set_invalid"):
            check_folder(FOLDER_ID, **self.dependencies())
        self.assertEqual(len(self.requests), 2)

    def test_provider_exception_fails(self):
        dep = self.dependencies()
        def failing_api(*_):
            raise RuntimeError("simulated Drive failure")
        dep["api"] = failing_api
        with self.assertRaisesRegex(RuntimeError, "simulated"):
            check_folder(FOLDER_ID, **dep)

    def test_no_failure_can_return_true(self):
        for key in ("verify_folder", "verify_list"):
            dep = self.dependencies()
            dep[key] = lambda *_: None
            with self.assertRaises(GateError):
                check_folder(FOLDER_ID, **dep)


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        unittest.main(argv=[sys.argv[0]], verbosity=1)
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--folder", required=True)
        args = parser.parse_args()
        try:
            live(args.folder)
        except Exception:
            # Even on syntax, auth or Drive failures, never allow a false PASS.
            # Do not expose original provider error messages, tokens or file IDs.
            print("NO-GO: synthetic business Drive folder GET-only check failed.", file=sys.stderr)
            sys.exit(1)
