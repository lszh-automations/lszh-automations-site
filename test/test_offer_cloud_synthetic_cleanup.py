import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location(
    "cleanup",Path(__file__).resolve().parents[1]/"scripts/offer-cloud-synthetic-cleanup.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class CleanupGuards(unittest.TestCase):
    def test_refuses_traffic_drift_before_writes(self):
        with patch.object(m,"service",side_effect=[
            {"metadata":{"annotations":{"run.googleapis.com/ingress":"internal"}},
             "status":{"traffic":[{"revisionName":m.PORTAL_BASELINE,"percent":100}]}},
            {"metadata":{"annotations":{"run.googleapis.com/ingress":"all",
              "run.googleapis.com/invoker-iam-disabled":"false"}},
             "status":{"traffic":[{"revisionName":m.BASELINE,"percent":90},
                                  {"revisionName":m.TAGGED_REVISION,"tag":m.TAG}]}}
        ]), patch.object(m,"gcloud") as cloud:
            with self.assertRaisesRegex(RuntimeError,"browser_traffic_drift"):
                m.verify_baselines()
            cloud.assert_not_called()

    def test_refuses_wrong_tag_or_missing_grants(self):
        for mode in ("tag","grant"):
            calls=[]
            def fake(args):
                calls.append(args)
                if args[:3]==["run","services","describe"] and args[3]==m.PORTAL:
                    return {"metadata":{"annotations":{"run.googleapis.com/ingress":"internal"}},
                            "status":{"traffic":[{"revisionName":m.PORTAL_BASELINE,"percent":100}]}}
                if args[:3]==["run","services","describe"]:
                    tagrev="wrong" if mode=="tag" else m.TAGGED_REVISION
                    return {"metadata":{"annotations":{"run.googleapis.com/ingress":"all"}},
                            "status":{"traffic":[{"revisionName":m.BASELINE,"percent":100},
                              {"revisionName":tagrev,"tag":m.TAG}]}}
                if args[:3]==["run","revisions","list"]:
                    return [{"metadata":{"name":r}} for r in m.REVISIONS]
                if args[:2]==["secrets","get-iam-policy"]:
                    return {"bindings":([] if mode=="grant" else
                      [{"role":m.ROLE,"members":[m.SA]}])}
                return {}
            with patch.object(m,"gcloud",side_effect=fake):
                with self.assertRaises(RuntimeError):m.verify_baselines()

if __name__=="__main__": unittest.main()

