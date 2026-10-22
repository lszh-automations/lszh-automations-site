import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("accept_once",
    Path(__file__).resolve().parents[1]/"scripts/offer-browser-synthetic-avv-accept-once.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class AcceptOnceTests(unittest.TestCase):
    def state(self):
        at="2026-10-18T23:00:00.000Z"
        s={"status":"accepted","revision":2,"acceptedAt":at,
           "bundle":{"quote":{"id":"quote"},"terms":{"id":"terms"},"avv":{"id":"avv"}},
           "evidence":{"name":m.PERSON,"email":m.EMAIL,"offer_number":m.preview.NUMBER,
            "accepted_at_utc":at,"authorized_confirmed":True,"quote_confirmed":True,
            "terms_confirmed":True,"avv_confirmed":True,"avv_required":True,
            "avv_version":m.preview.AVV_VERSION,"avv_pdf_sha256":m.preview.HASHES["avv"],
            "quote_pdf_sha256":m.preview.HASHES["quote"],"terms_pdf_sha256":m.preview.HASHES["terms"]}}
        f={"Online-Annahme AVV ausdrücklich akzeptiert":True,
           "Online-Annahme AVV-Version":m.preview.AVV_VERSION,
           "Online-Annahme AVV-SHA256":m.preview.HASHES["avv"],
           "Online-Annahme AVV Drive ID":"avv",
           "Status":"Angenommen","Vertragsunterlagen akzeptiert":True,
           "Online-Annahme Person":m.PERSON,"Online-Annahme E-Mail":m.EMAIL,
           "Online-Annahme Vertragsversion":"TEST_v1.0_RC1",
           "Online-Annahme Offerten-SHA256":m.preview.HASHES["quote"],
           "Online-Annahme Bedingungen-SHA256":m.preview.HASHES["terms"],
           "Online-Annahme Offerten Drive ID":"quote","Online-Annahme Bedingungen Drive ID":"terms",
           "Online-Annahme Zeitstempel":"2026-10-18T23:00:00Z"}
        return s,f

    def test_one_post_and_independent_readback(self):
        result={"ok":True,"accepted":True,"test_only":True,"offer_number":m.preview.NUMBER,
                "confirmation_email_pending":False,"airtable_sync_status":"synced"}
        pending=({"status":"sent"},{"Status":"Entwurf"})
        with patch.object(m,"read_state",side_effect=[pending,self.state()]) as read, \
             patch.object(m,"api",return_value=result) as api:
            m.run(True,"fake-code","fake-google","fake-pat","fake-identity")
        self.assertEqual(api.call_count,1)
        self.assertTrue(api.call_args.args[2]["accept_avv"])
        self.assertEqual(api.call_args.args[2]["avv_version"],m.preview.AVV_VERSION)
        self.assertEqual(api.call_args.args[0],m.preview.ORIGIN+"/api/offer/accept")
        self.assertEqual(read.call_count,2)

    def test_uncertain_response_never_retries_post(self):
        with patch.object(m,"read_state",side_effect=[
            ({"status":"sent"},{"Status":"Entwurf"}),self.state()]), \
             patch.object(m,"api",side_effect=TimeoutError()) as api:
            m.run(True,"fake-code","g","a","i")
        self.assertEqual(api.call_count,1)

    def test_already_accepted_is_readback_only(self):
        with patch.object(m,"read_state",return_value=self.state()),patch.object(m,"api") as api:
            m.run(True,"fake-code","g","a","i")
        api.assert_not_called()

    def test_airtable_not_updated_fails_even_when_firestore_accepted(self):
        s,f=self.state()
        f["Status"]="Entwurf"
        with self.assertRaisesRegex(RuntimeError,"airtable_acceptance_unconfirmed"):
            m.verify_accepted(s,f)

    def test_wrong_pdf_reference_and_consent_fail(self):
        s,f=self.state()
        f["Online-Annahme Offerten Drive ID"]="wrong"
        with self.assertRaises(RuntimeError):m.verify_accepted(s,f)
        s,f=self.state()
        s["evidence"]["terms_confirmed"]=False
        with self.assertRaises(RuntimeError):m.verify_accepted(s,f)


    def test_missing_avv_consent_or_hash_rejected(self):
        for key,value in [("avv_confirmed",False),("avv_pdf_sha256","wrong"),("avv_version","wrong")]:
            s,f=self.state()
            s["evidence"][key]=value
            with self.assertRaises(RuntimeError): m.verify_accepted(s,f)
        s,f=self.state()
        f["Online-Annahme AVV ausdrücklich akzeptiert"]=False
        with self.assertRaises(RuntimeError):m.verify_accepted(s,f)

if __name__=="__main__":
    unittest.main()

