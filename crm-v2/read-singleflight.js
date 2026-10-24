'use strict';

// Coalesce only *concurrent* read-only dashboard scans. No TTL/cache:
// completed results are discarded, so subsequent requests recompute live
// balances and tasks rather than serving stale financial totals.
function singleflight(compute){
  if(typeof compute!=='function')throw TypeError('compute must be a function');
  let pending=null;
  return function run(){
    if(pending)return pending;
    const current=Promise.resolve().then(compute);
    pending=current;
    // Clear on both success and failure, without spawning an unhandled
    // rejection from a detached .finally() promise.
    current.then(
      ()=>{if(pending===current)pending=null;},
      ()=>{if(pending===current)pending=null;}
    );
    return current;
  };
}
module.exports={singleflight};
