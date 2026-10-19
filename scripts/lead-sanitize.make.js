// Same checked logic lives in scripts/lead-sanitize.make.js on the MVP branch.
// Make Code inputs: name, company, email, message, current_process, systems,
// main_problem, frequency, desired_result, submitted_at.
// No untrusted value is interpolated into a raw JSON literal or HTML element.
const limits={
  name:120,company:160,email:254,message:2500,current_process:2500,
  systems:1200,main_problem:80,frequency:80,desired_result:1600
};
const data={};
for(const [key,max] of Object.entries(limits)){
  const value=input[key];
  if(typeof value!=='string' && !(key==='desired_result'&&(value==null||value==='')))
    throw Error('INVALID_LEAD_FIELD_'+key);
  const str=String(value||'').trim();
  if(str.length>max || (key!=='desired_result'&&!str))
    throw Error('INVALID_LEAD_FIELD_'+key);
  data[key]=str;
}
if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email))
  throw Error('INVALID_LEAD_EMAIL');
const submittedAt=String(input.submitted_at||'').trim();
if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(submittedAt)||
   Number.isNaN(Date.parse(submittedAt)))throw Error('INVALID_TIMESTAMP');
const esc=s=>String(s).replace(/&/g,'&amp;')
  .replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const html=s=>esc(s).replace(/\r\n|\n|\r/g,'<br>');
const headline=s=>s.replace(/[\r\n\u2028\u2029]+/g,' ').replace(/[<>"']/g,'').slice(0,150);
const airtableJson=JSON.stringify({fields:{
  'Name':data.name,
  'Firma':data.company,
  'E-Mail':data.email,
  'Nachricht':data.message,
  'Heutiger Ablauf':data.current_process,
  'Beteiligte Systeme':data.systems,
  'Grösstes Problem':data.main_problem,
  'Prozesshäufigkeit':data.frequency,
  'Gewünschtes Ergebnis':data.desired_result,
  'Status':'Neu','Priorität':'Normal',
  'Quelle':'LSZH Automations Website',
  'Eingegangen am':submittedAt,
  'CRM Dashboard':['recducv1Ym0fcbDqr']
}});
return {
  airtableJson,
  email:data.email,
  nameHtml:html(data.name),
  companyHtml:html(data.company),
  emailHtml:html(data.email),
  messageHtml:html(data.message),
  processHtml:html(data.current_process),
  systemsHtml:html(data.systems),
  mainProblemHtml:html(data.main_problem),
  frequencyHtml:html(data.frequency),
  desiredResultHtml:html(data.desired_result),
  sourceHtml:'LSZH Automations Website',
  submittedAtHtml:esc(submittedAt),
  nameSubject:headline(data.name),
  companySubject:headline(data.company)
};
