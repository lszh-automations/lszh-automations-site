// Explicit operator-only exception for a non-binding personal-data pilot.
// No I/O, dispatch capability, customer approval or arbitrary recipient option.
export const INTERNAL_TEST_PILOT={
  purpose:'LSZH_INTERNAL_TEST_ONLY_NO_CONTRACT_20261019',
  number:'TEST_INTERNAL_LARS_20261019_NO_CONTRACT',
  email:'lars.schulthess@outlook.com',
  company:'LSZH Invest GmbH – TEST_ONLY – kein Vertrag'
};
export function isInternalTestPilot(offer,recordId){
  const p=INTERNAL_TEST_PILOT;
  return /^rec[A-Za-z0-9]{14}$/.test(recordId||'') &&
    offer?.source?.recordId===recordId &&
    offer.source.internalPilot===p.purpose &&
    offer.source.kind==='LSZH_SYNTHETIC_ONLY' &&
    offer.offerNumber===p.number && offer.recipientEmail===p.email &&
    offer.details?.company===p.company &&
    offer.bundle?.avv_required==='Nein' &&
    offer.termsVersion==='TEST_v1.0_RC1';
}
