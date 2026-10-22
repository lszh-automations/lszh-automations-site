import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

P = pathlib.Path(__file__).resolve().parents[1] / "scripts/offer-browser-synthetic-release.py"
spec = importlib.util.spec_from_file_location("release", P)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def test_readonly_check_never_requests_secret_values_or_mutations(self):
        calls = []
        def cloud(args, timeout=90):
            calls.append(args)
            if args[:3] == ["run", "services", "describe"]:
                if args[3] == "lszh-offer-portal-staging":
                    return {"metadata":{"annotations":{"run.googleapis.com/ingress":"internal"}},
                            "status":{"traffic":[{"revisionName":"lszh-offer-portal-staging-00004-qt7","percent":100}]}}
                return {"metadata":{"annotations":{"run.googleapis.com/ingress":"all"}},
                        "status":{"traffic":[{"revisionName":release.BASELINE,"percent":100},
                            {"tag":release.TAG,"revisionName":release.PREVIOUS,"url":release.ORIGIN}]},
                        "spec":{"template":{"spec":{"serviceAccountName":
                            release.SA,"containers":[{"image":release.PREVIOUS_IMAGE}]}}}}
            if args[:3] == ["run", "services", "get-iam-policy"]:
                return {"bindings":[{"role":"roles/run.invoker","members":["user:"+release.USER]}]}
            if args[:2] == ["secrets", "get-iam-policy"]:
                return {"bindings":[{"role":"roles/secretmanager.secretAccessor",
                    "members":["serviceAccount:"+release.SA]}]}
            if args[:3] == ["run", "revisions", "list"]:
                return []
            if args[:3] == ["secrets", "versions", "describe"]:
                return {"state":"ENABLED"}
            return {}
        with patch.object(release, "cloud", cloud), patch.object(release, "command", return_value=""), \
             patch.object(release.shutil, "which", return_value="/mock"):
            release.check()
        self.assertFalse(any("access" in args or "deploy" in args or
                             "add-iam-policy-binding" in args for args in calls))

    def test_build_failure_never_grants_secrets_or_deploys(self):
        calls = []
        def cloud(args, timeout=90):
            calls.append(args)
            return {"status":"FAILURE"}
        with patch.object(release, "package"), patch.object(release, "cloud", cloud):
            with self.assertRaisesRegex(RuntimeError, "cloud_build_not_success"):
                release.apply()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][:2], ["builds", "submit"])

    def test_fix_keeps_no_traffic_and_does_not_modify_iam(self):
        calls = []
        env = {}
        image = release.IMAGE.split(":")[0]+"@sha256:"+"a"*64
        def cloud(args, timeout=90):
            calls.append(args)
            if args[:2] == ["builds", "submit"]:
                return {"status":"SUCCESS","results":{"images":[{"name":release.IMAGE,"digest":"sha256:"+"a"*64}]}}
            if args[:2] == ["run", "deploy"]:
                env.update(dict(x.split("=",1) for x in next(
                    a for a in args if a.startswith("--set-env-vars=")).split("=",1)[1].split(",")))
                return {}
            if args[:3] == ["run", "revisions", "describe"]:
                return {"spec":{"serviceAccountName":release.SA,
                    "containers":[{"image":image,"env":[{"name":k,"value":v} for k,v in env.items()]+[
                        {"name":k,"valueFrom":{"secretKeyRef":{"name":v,"key":"1"}}}
                        for k,v in release.SECRETS.items()]}]},
                    "status":{"conditions":[{"type":"Ready","status":"True"}]}}
            return {}
        state = {"status":{"traffic":[{"revisionName":release.BASELINE,"percent":100},
            {"tag":release.TAG,"revisionName":release.REVISION,"url":release.ORIGIN}]}}
        with patch.object(release, "package"), patch.object(release, "cloud", cloud), \
             patch.object(release, "check"), patch.object(release, "service", return_value=state), \
             patch.object(release, "private_service"), patch.object(release, "protected_portal"):
            release.apply()
        deploy = next(a for a in calls if a[:2] == ["run","deploy"])
        self.assertIn("--no-traffic", deploy)
        self.assertIn("--tag=cloud-e2e", deploy)
        self.assertIn("--service-account="+release.SA, deploy)
        self.assertNotIn("--allow-unauthenticated", deploy)
        self.assertEqual(env["LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID"],"recensIiczNGsoPeR")
        grants = [a for a in calls if a[:2] == ["secrets","add-iam-policy-binding"]]
        self.assertEqual(grants, [])
        self.assertFalse(any(a[:2] == ["projects","add-iam-policy-binding"] for a in calls))

    def test_resume_reuses_successful_build_without_submit(self):
        build_id = "11111111-2222-3333-4444-555555555555"
        calls = []
        def cloud(args, timeout=90):
            calls.append(args)
            return {"id":build_id, "projectId":release.PROJECT,
                    "images":[release.IMAGE], "status":"SUCCESS",
                    "results":{"images":[{"name":release.IMAGE,"digest":"sha256:"+"b"*64}]}}
        # Stop at the subsequent baseline check to isolate the read-only reuse path.
        with patch.object(release, "cloud", cloud), \
             patch.object(release, "check", side_effect=RuntimeError("baseline_drift")), \
             patch.object(release, "package") as package:
            with self.assertRaisesRegex(RuntimeError, "baseline_drift"):
                release.apply(build_id)
        self.assertEqual(calls, [["builds","describe",build_id,"--region="+release.REGION]])
        package.assert_not_called()

    def test_resume_rejects_wrong_build_before_any_writes(self):
        build_id = "11111111-2222-3333-4444-555555555555"
        for changed in [
            {"projectId":"wrong"}, {"images":["wrong"]}, {"status":"WORKING"},
            {"results":{"images":[{"name":release.IMAGE,"digest":"bad"}]}}
        ]:
            build = {"id":build_id,"projectId":release.PROJECT,"images":[release.IMAGE],
                     "status":"SUCCESS","results":{"images":[
                         {"name":release.IMAGE,"digest":"sha256:"+"b"*64}]}}
            build.update(changed)
            with patch.object(release, "cloud", return_value=build) as cloud:
                with self.assertRaises(RuntimeError):
                    release.apply(build_id)
                self.assertEqual(cloud.call_count, 1)

    def test_build_log_suppression_and_json_diagnostic(self):
        with patch.object(release, "package"), \
             patch.object(release, "cloud", return_value={"status":"FAILURE"}) as cloud:
            with self.assertRaises(RuntimeError):
                release.apply()
            self.assertIn("--suppress-logs", cloud.call_args.args[0])
        with patch.object(release, "command", return_value="BUILD LOG\\n{}"):
            with self.assertRaisesRegex(RuntimeError, "invalid_json_from_gcloud: builds submit"):
                release.cloud(["builds","submit","directory"])


if __name__ == "__main__":
    unittest.main()
