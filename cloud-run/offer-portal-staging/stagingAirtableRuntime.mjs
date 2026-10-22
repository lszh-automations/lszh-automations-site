// Existing Cloud Run portal -> business Airtable, explicitly opt-in.
// No new Cloud service, trigger, scheduler or service account.
// Runtime must pass a validated staging config and an injected fetch function.
import {STAGING,stagingConfig} from './stagingConfig.mjs';
import {createSyntheticAirtableRestClient,
  executeSyntheticAirtableAcceptanceWriteback} from './receiptAirtableWriteback.mjs';

export function createStagingAirtableCallback({config,env={},fetcher}={}){
  // Absent flag means NO provider calls and no credentials are required.
  if(env.LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED!=='true')
    return undefined;
  // Browser pilot must pass the full runtime gate, including its pinned record.
  const browserValid=config?.browserPilot===true &&
    stagingConfig(env).browserPilot===true;
  if(config?.enabled!==true || (!browserValid && env.K_SERVICE!==STAGING.service) ||
     typeof fetcher!=='function')
    throw Error('staging_airtable_runtime_invalid');
  // The token is supplied at runtime by a business-account secret injection.
  // It must never appear in GitHub, the image, CI fixtures or response bodies.
  const client=createSyntheticAirtableRestClient({
    fetcher,accessToken:env.LSZH_AIRTABLE_ACCESS_TOKEN
  });
  return acceptedOffer=>executeSyntheticAirtableAcceptanceWriteback(
    acceptedOffer,client
  );
}
