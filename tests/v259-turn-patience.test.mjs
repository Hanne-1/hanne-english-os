import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.25.9';
const vocabulary=['niece','ancestor','descendant','sibling','spouse'];
const lesson={id:'v259',title:'Family',curriculum:{mainVocabulary:vocabulary.map(term=>({term})),extendedVocabulary:[],grammar:[{rule:'not coverage'}]}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));

function action(over={}){
  return Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,importantCorrectionRequired:false,retryPhase:false,retryReceived:false,retryFinished:false,retryAccepted:false,...over});
}

test('V2.25.9 Turn Patience remains recognized under the V2.26.0 controller',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert(Q.isTurnPatienceReport({schemaVersion:V}));
  assert(Q.isLiveControllerSimplificationReport({schemaVersion:V}));
  assert.deepEqual(items.map(x=>x.target),vocabulary);
  assert(items.every(x=>x.kind==='vocabulary'));
  assert(live.includes('AWAITING_LEARNER'));
  assert(!live.includes('runtimeFinalState'));
  assert(live.includes('CURRENT WORD IS THE CONTROL CENTER'));
  assert(live.includes('CURRENT WORD STAYS LOCKED UNTIL IT CAN RESOLVE'));
});

test('TEST 1 — interrupted multi-pause answer stays silent until the final clause',()=>{
  for(const fragment of ['My ancestor was a businessman...','My ancestor was a businessman and he...','My ancestor was a businessman and he sold pork...']){
    assert.equal(Q.isClearlyUnfinishedUtterance(fragment),true);
    const wait=action({learnerFinished:false,targetProducedIndependently:Q.containsTarget(fragment,'ancestor'),importantCorrectionRequired:true});
    assert.equal(wait.coachAction,'WAIT');assert.equal(wait.queueAdvance,false);assert.equal(wait.runtimeState,'AWAITING_LEARNER');
  }
  const complete='My ancestor was a businessman and he sold pork in the market.';
  assert.equal(Q.isClearlyUnfinishedUtterance(complete),false);
  assert.equal(action().queueAdvance,true);
});

test('TEST 2 — a complete sentence can still be followed by another sentence',()=>{
  const first='I have one sibling and he is my younger brother.';
  const stillFormulating=action({learnerFinished:false,targetProducedIndependently:Q.containsTarget(first,'sibling')});
  assert.equal(stillFormulating.coachAction,'WAIT');assert.equal(stillFormulating.queueAdvance,false);
  const whole=first+' I think he is very annoying.';
  assert.equal(Q.detectImportantLanguageIssues(whole,items[3],V).length,0);
  assert.equal(action().queueAdvance,true);
});

test('TEST 3 — multi-pause Retry keeps its correction lock until fully finished',()=>{
  const partial=action({learnerFinished:false,retryPhase:true,retryReceived:true,retryFinished:false,retryAccepted:false});
  assert.equal(partial.runtimeState,'AWAITING_RETRY');assert.equal(partial.correctionLock,'awaiting_retry');assert.equal(partial.coachAction,'WAIT_FOR_RETRY');assert.equal(partial.queueAdvance,false);
  const finished=action({retryPhase:true,retryReceived:true,retryFinished:true,retryAccepted:true});
  assert.equal(finished.runtimeState,'RESOLVED');assert.equal(finished.queueAdvance,true);
});

test('TEST 4 — missing be correction remains active after whole-answer completion',()=>{
  const issues=Q.detectImportantLanguageIssues('My niece five years old.',items[0],V);
  assert.equal(issues[0].category,'missing_be_verb');assert.equal(issues[0].better,'My niece is five years old.');
  const correction=action({importantCorrectionRequired:true});
  assert.equal(correction.coachAction,'CORRECT_AND_REQUEST_RETRY');assert.equal(correction.endCoachTurn,true);assert.equal(correction.queueAdvance,false);
});

test('TEST 5 — singular/plural correction remains active after whole-answer completion',()=>{
  const issues=Q.detectImportantLanguageIssues('I have one siblings.',items[3],V);
  assert.equal(issues[0].category,'singular_plural');assert.equal(issues[0].better,'I have one sibling.');
  assert.equal(action({importantCorrectionRequired:true}).coachAction,'CORRECT_AND_REQUEST_RETRY');
});

test('TEST 6 — ASR uncertainty is clarification, never PASS',()=>{
  const unclear=action({hearingResolved:false,targetProducedIndependently:true});
  assert.equal(unclear.runtimeState,'HEARING_UNRESOLVED');assert.equal(unclear.coachAction,'CLARIFY_HEARING');assert.equal(unclear.queueAdvance,false);
  assert(live.includes('If audio is unclear'));
  assert(live.includes('Never reconstruct speech'));
});

test('Incomplete trailing structures are server-visible unfinished evidence',()=>{
  for(const value of ['and...','but...','because...','so...','if...','when...','they...','he...','she...','my spouse...','I think...','My ancestor was a businessman and they...'])assert.equal(Q.isClearlyUnfinishedUtterance(value),true,value);
  for(const value of ['My ancestor was a businessman.','My spouse will be my partner in life.','I think he is very annoying.'])assert.equal(Q.isClearlyUnfinishedUtterance(value),false,value);
});

test('Live prompt prefers silence and applies whole-turn patience to target, correction, and Retry',()=>{
  assert(live.includes('During normal formulation pauses SAY NOTHING'));
  assert(live.includes('keeps the Learner turn open'));
  assert(live.includes('If Target is missing'));
  assert(live.includes('An incorrect, unfinished, or fragment-only Retry stays on CURRENT WORD'));
  assert(live.includes('Do not say “I\'m waiting”, “Take your time”, or “Keep going”'));
});
