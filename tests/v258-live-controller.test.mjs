import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.25.8';
const lesson={id:'v258',title:'Family',curriculum:{mainVocabulary:['niece','ancestor','descendant','sibling','spouse'].map(term=>({term})),extendedVocabulary:[],grammar:[{rule:'missing be'}]}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const report=client.slice(client.indexOf('B. REPORT CONTRACT'));

function decision(utterance,item,over={}){
  const learnerFinished=over.learnerFinished!==false;
  const targetProducedIndependently=Q.containsTarget(utterance,item.target)&&over.coachSuppliedAnswer!==true;
  const importantCorrectionRequired=learnerFinished&&targetProducedIndependently&&Q.detectImportantLanguageIssues(utterance,item,V).length>0;
  return Q.decideRuntimeAction({learnerFinished,hearingResolved:over.hearingResolved!==false,targetProducedIndependently,importantCorrectionRequired,retryPhase:over.retryPhase===true,retryReceived:over.retryReceived===true,retryFinished:over.retryFinished===true,retryAccepted:over.retryAccepted===true});
}

test('V2.25.8 keeps Vocabulary-only dynamic coverage and excludes Grammar',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');assert(Q.isLiveControllerSimplificationReport({schemaVersion:V}));
  assert.deepEqual(items.map(x=>x.target),['niece','ancestor','descendant','sibling','spouse']);
  for(const count of [5,8,4]){
    const q=Q.inventory({id:'x'+count,curriculum:{mainVocabulary:Array.from({length:count},(_,i)=>({term:'w'+i})),grammar:[{rule:'g'}]}},[],{schemaVersion:V});
    assert.equal(q.length,count);assert(q.every(x=>x.kind==='vocabulary'));
  }
});

test('Micro Test 1: missing be triggers immediate terminal correction and Retry',()=>{
  const item=items[0],utterance='My niece five years old.';
  const issues=Q.detectImportantLanguageIssues(utterance,item,V);
  assert.equal(issues.length,1);assert.equal(issues[0].category,'missing_be_verb');assert.equal(issues[0].better,'My niece is five years old.');
  const action=decision(utterance,item);
  assert.equal(action.coachAction,'CORRECT_AND_REQUEST_RETRY');assert.equal(action.queueAdvance,false);assert.equal(action.endCoachTurn,true);
  const output=Q.terminalCorrectionText({original:utterance,better:issues[0].better,reason:'You need “is” before the age.'});
  assert(output.endsWith('Now try it again.'));assert(!/ancestor|next vocabulary/i.test(output));
});

test('Micro Test 2: one siblings gets minimal singular correction and cannot advance',()=>{
  const item=items[3],utterance='I have one siblings.';
  const issues=Q.detectImportantLanguageIssues(utterance,item,V);
  assert.equal(issues.length,1);assert.equal(issues[0].category,'singular_plural');assert.equal(issues[0].better,'I have one sibling.');
  const action=decision(utterance,item);
  assert.equal(action.coachAction,'CORRECT_AND_REQUEST_RETRY');assert.equal(action.queueAdvance,false);
  const badRetry=Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,importantCorrectionRequired:true,retryPhase:true,retryReceived:true,retryFinished:true,retryAccepted:false});
  assert.equal(badRetry.queueAdvance,false);assert.equal(badRetry.endCoachTurn,true);
});

test('Micro Test 3: missing descendant remains on the current word after Coach help',()=>{
  const item=items[2],utterance='My niece is the daughter of my cousin.';
  assert.equal(Q.containsTarget(utterance,item.target),false);
  let action=decision(utterance,item);
  assert.equal(action.coachAction,'ELICIT_TARGET');assert.equal(action.queueAdvance,false);assert.equal(action.endCoachTurn,true);
  action=decision(utterance,item,{coachSuppliedAnswer:true});
  assert.equal(action.queueAdvance,false);
  action=decision('My niece is a descendant of my cousin.',item);
  assert.equal(action.queueAdvance,true);
});

test('Live Brief stays compact while Report/Audit details remain separated',()=>{
  assert(live.includes('CURRENT WORD IS THE CONTROL CENTER'));
  assert(live.includes('CAN THE CURRENT WORD BE RESOLVED NOW?'));
  assert(live.includes('HANDLE ONE BLOCKING PROBLEM'));
  assert(live.includes('stay on the CURRENT WORD'));
  assert(live.includes('AWAITING_LEARNER'));
  assert(!live.includes('EVALUATING_RETRY'));
  assert(!live.includes('runtimeFinalState'));
  assert(!live.includes('correctionTurnSequence'));
  assert(!live.includes('sourceVersion'));
  assert(!live.includes('HARD RULE'));
  assert(client.includes("coverageId:'COPY_EXACT_ID'"));
  assert(report.includes('${JSON.stringify(schema,null,2)}'));
  assert(report.includes('sourceVersion'));
  assert(client.includes("currentItemStateHistory:['PENDING'"));
  assert(client.includes('correctionTurnSequence:3'));
  assert(report.includes('C. SERVER VALIDATION — AFTER REPORT GENERATION'));
  assert(live.split(/\s+/).length<1200);
});

test('Full flow keeps correction, slow-turn, audit and Final Challenge gates',()=>{
  assert.equal(decision('My niece is five years old. She is a very kind girl.',items[0]).queueAdvance,true);
  assert.equal(decision('My ancestor was a businessman. He sold pork in the market.',items[1]).queueAdvance,true);
  assert.equal(decision('My niece is the daughter of my cousin.',items[2]).queueAdvance,false);
  assert.equal(decision('I have one siblings.',items[3]).queueAdvance,false);
  assert.equal(decision('If I get married...',items[4],{learnerFinished:false}).coachAction,'WAIT');
  assert(live.includes('compare COMPLETED WORDS with REQUIRED VOCABULARY'));
  assert(live.includes('Start Final Challenge only when every required word is complete'));
  assert(live.includes('only a complete Learner Retry can resolve it'));
});
