'use strict';

// Airtable's per-base request budget is shared by listing and evidence reads.
// Serialize these calls and retry bounded temporary throttling. A failure remains
// 'unavailable' rather than an optimistic completion claim.
function createPacedAirtableFetch(baseFetch = fetch, intervalMs = 260) {
  let tail=Promise.resolve();
  let next=0;
  return (url, options) => {
    const task=tail.then(async()=>{
      for (let attempt=0;attempt<3;attempt++){
        const delay=Math.max(0,next-Date.now());
        if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
        next=Date.now()+intervalMs;
        const response=await baseFetch(url,options);
        if (![429,502,503,504].includes(response.status) || attempt===2)
          return response;
        // Back off on 429/temporary outages, but never retry write operations.
        if(options?.method!=='GET') return response;
        const retryMs=Math.min(5000,750*(2**attempt));
        await new Promise(resolve=>setTimeout(resolve,retryMs));
      }
    });
    tail=task.then(()=>{},()=>{});
    return task;
  };
}
module.exports={createPacedAirtableFetch};
