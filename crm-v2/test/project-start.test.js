const {test}=require('node:test'),assert=require('node:assert/strict');
const {validProjectStartDay,projectStartReadiness}=require('../project-tasks');
const {localSwissDate}=require('../invoice-accounting');
test('readiness uses real calendar dates and the Swiss day without changing records',()=>{
 assert.equal(validProjectStartDay('2028-02-29'),true);assert.equal(validProjectStartDay('2026-02-29'),false);assert.equal(validProjectStartDay('2026-13-01'),false);
 const p={customerId:'TEST_ONLY',owner:'TEST_ONLY',startDate:'2026-10-27',status:'Geplant',tasks:[{title:'Testen',done:false}],onboarding:{makeRequired:false,invitationConfirmed:false,accessConfirmed:true,notes:''}},before=JSON.stringify(p);
 assert.equal(projectStartReadiness(p,'2026-10-26').canStart,false);
 assert.equal(projectStartReadiness(p,localSwissDate(new Date('2026-10-26T23:30:00Z'))).canStart,true);
 assert.equal(projectStartReadiness({...p,startedAt:'2026-10-27T10:00:00Z'},'2026-10-27').canStart,false);
 assert.equal(projectStartReadiness({...p,status:'Abgeschlossen'},'2026-10-27').canStart,false);
 assert.ok(projectStartReadiness({...p,onboarding:{...p.onboarding,makeRequired:true}},'2026-10-27').missing.includes('Make-Einladung prüfen'));
 assert.equal(JSON.stringify(p),before);
});
