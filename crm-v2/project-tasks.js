'use strict';

// Small, dependency-free project checklist for the LOCAL CRM preview.
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
module.exports={cleanProjectTasks,projectProgress,overdueProject,MAX_TASKS};
