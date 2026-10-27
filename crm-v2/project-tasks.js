'use strict';

// Project checklists and manually confirmed onboarding for the authenticated CRM.
// Each project owns an ordered list. No external task service or notifications.
const MAX_TASKS=30;
function projectError(message){return Object.assign(new Error(message),{status:400});}
function cleanProjectTasks(input){
  if(!Array.isArray(input)||input.length>MAX_TASKS)
    throw projectError('Maximal 30 Projektaufgaben erlaubt');
  return input.map((task,index)=>{
    if(!task||typeof task!=='object'||Array.isArray(task))
      throw projectError('Ungültige Projektaufgabe '+(index+1));
    if(typeof task.title!=='string'||!task.title.trim()||task.title.trim().length>160)
      throw projectError('Aufgabenbezeichnung fehlt oder ist zu lang (Position '+(index+1)+')');
    if(typeof task.done!=='boolean')
      throw projectError('Ungültiger Aufgabenstatus (Position '+(index+1)+')');
    return {title:task.title.trim(),done:task.done};
  });
}
function projectProgress(project){
  const tasks=Array.isArray(project?.tasks)?project.tasks:[];
  const total=tasks.length;
  const completed=tasks.filter(t=>t&&t.done===true).length;
  return {total,completed,percent:total?Math.round(completed*100/total):0};
}
function overdueProject(project,today){
  if(!project||project.status==='Abgeschlossen')return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(project.dueDate||''))return false;
  return project.dueDate < today;
}
function defaultOnboarding(){return {makeRequired:null,invitationConfirmed:false,accessConfirmed:false,notes:''};}
function cleanProjectOnboarding(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw projectError('Ungültiges Onboarding');
  const {makeRequired,invitationConfirmed,accessConfirmed,notes}=value;
  if(![null,true,false].includes(makeRequired)||typeof invitationConfirmed!=='boolean'||typeof accessConfirmed!=='boolean'||typeof notes!=='string'||notes.length>2000)
    throw projectError('Onboarding unvollständig oder ungültig; Notizen maximal 2000 Zeichen');
  if(invitationConfirmed&&makeRequired!==true)throw projectError('Make-Einladung nur bei benötigtem Make-Zugang bestätigen');
  if(accessConfirmed&&(makeRequired===null||(makeRequired===true&&!invitationConfirmed)))
    throw projectError('Zuerst Make-Bedarf und gegebenenfalls die Einladung bestätigen');
  return {makeRequired,invitationConfirmed,accessConfirmed,notes:notes.trim()};
}
function projectOnboardingState(project){
  const o=project?.onboarding;
  if(typeof o?.makeRequired!=='boolean')return {status:'Make-Bedarf klären',next:'Klären, ob für diesen Auftrag eine eigene Make-Organisation benötigt wird.'};
  if(o.makeRequired&&!o.invitationConfirmed)return {status:'Make-Einladung ausstehend',next:'Kunden an die Einladung von lars@lszh-automations.ch in seine Make-Organisation erinnern.'};
  if(!o.accessConfirmed)return {status:'Zugänge prüfen',next:'Benötigte Einladungen annehmen, Berechtigungen und Systemverbindungen gemeinsam prüfen.'};
  return {status:'Bereit zur Einrichtung',next:'Projektstart mit dem Kunden abstimmen und die Einrichtung planen.'};
}
function validProjectStartDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function projectStartReadiness(project,today){
  const missing=[],o=project?.onboarding;
  if(!project?.customerId)missing.push('Kunden zuordnen');
  if(typeof o?.makeRequired!=='boolean')missing.push('Make-Bedarf klären');
  if(o?.makeRequired===true&&o?.invitationConfirmed!==true)missing.push('Make-Einladung prüfen');
  if(o?.accessConfirmed!==true)missing.push('Zugänge und Berechtigungen prüfen');
  if(!validProjectStartDay(project?.startDate))missing.push('Gültiges Startdatum festlegen');
  else if(project.startDate>today)missing.push('Startdatum liegt noch in der Zukunft');
  if(typeof project?.owner!=='string'||!project.owner.trim())missing.push('Verantwortliche Person eintragen');
  if(!Array.isArray(project?.tasks)||!project.tasks.length)missing.push('Mindestens einen Umsetzungsschritt festlegen');
  const started=Boolean(project?.startedAt),closed=project?.status==='Abgeschlossen';
  return {canStart:!started&&!closed&&!missing.length,started,missing,
    status:started?'Projektstart dokumentiert':closed?'Projekt abgeschlossen':project?.status==='In Arbeit'?'In Arbeit – Start noch nicht dokumentiert':missing.length?'Projektstart vorbereiten':'Bereit zum Projektstart'};
}
module.exports={validProjectStartDay,projectStartReadiness,cleanProjectTasks,projectProgress,overdueProject,MAX_TASKS,defaultOnboarding,cleanProjectOnboarding,projectOnboardingState};
