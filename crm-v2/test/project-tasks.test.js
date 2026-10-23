'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {cleanProjectTasks,projectProgress,overdueProject}=require('../project-tasks');

test('project tasks keep their order and done flags',()=>{
  const original=[
    {title:'  Kontakt bestätigen  ',done:true,ignored:'not persisted'},
    {title:'Testintegration prüfen',done:false}
  ];
  const clean=cleanProjectTasks(original);
  assert.deepEqual(clean,[
    {title:'Kontakt bestätigen',done:true},
    {title:'Testintegration prüfen',done:false}
  ]);
  assert.deepEqual(projectProgress({tasks:clean}),{total:2,completed:1,percent:50});
});
test('empty project has zero progress and legacy projects need no migration',()=>{
  assert.deepEqual(projectProgress({}),{total:0,completed:0,percent:0});
  assert.deepEqual(cleanProjectTasks([]),[]);
});
test('invalid project tasks are rejected without silent coercion',()=>{
  const valid={title:'Testaufgabe',done:false};
  for(const invalid of [
    [{title:'',done:false}],[{title:'Test',done:1}],
    [{title:'Test',done:'false'}],[{title:'X'.repeat(161),done:false}],
    [{done:false}],[null],
    Array.from({length:31},()=>({...valid}))
  ])assert.throws(()=>cleanProjectTasks(invalid));
  assert.throws(()=>cleanProjectTasks({title:'single task'}));
});
test('overdue dates ignore completed projects and today',()=>{
  assert.equal(overdueProject({dueDate:'2026-10-22',status:'In Arbeit'},'2026-10-23'),true);
  assert.equal(overdueProject({dueDate:'2026-10-23',status:'In Arbeit'},'2026-10-23'),false);
  assert.equal(overdueProject({dueDate:'2026-10-22',status:'Abgeschlossen'},'2026-10-23'),false);
  assert.equal(overdueProject({dueDate:'',status:'Geplant'},'2026-10-23'),false);
});
