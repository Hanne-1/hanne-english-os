import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.26.0';
const lesson={id:'v260-three-gates',title:'Family',curriculum:{mainVocabulary:['niece','ancestor','descendant','sibling','spouse'].map(term=>({term})),extendedVocabulary:[],grammar:[{rule:'context only'}]}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const action=over=>Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,languageAccuracyPassed:true,retryPhase:false,retryReceived:false,retryFinished:false,retryAccepted:false,...over});

test('MICRO 1/8 — Article Gate blocks advance and requests terminal Retry',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');assert(Q.isThreeGateReport({schemaVersion:V}));
  const utterance='My niece is a student and she is very kind girl.';
  const issues=Q.detectImportantLanguageIssues(utterance,items[0],V);
  assert.equal(issues[0].category,'important_article_determiner');
  assert.equal(issues[0].better,'My niece is a student and she is a very kind girl.');
  const result=action({languageAccuracyPassed:false,importantCorrectionRequired:true});
  assert.deepEqual([result.coachAction,result.queueAdvance,result.endCoachTurn],['CORRECT_AND_REQUEST_RETRY',false,true]);
  assert(Q.terminalCorrectionText({original:utterance,better:issues[0].better,reason:'You need “a” before “girl.”'}).endsWith('Now try it again.'));
  assert(live.includes('CURRENT WORD IS THE CONTROL CENTER'));assert(live.includes('CURRENT WORD STAYS LOCKED UNTIL IT CAN RESOLVE'));
});

test('MICRO 2/8 — Missing BE fails Language Gate',()=>{
  const issues=Q.detectImportantLanguageIssues('My niece five years old.',items[0],V);
  assert.equal(issues[0].category,'missing_be_verb');
  assert.equal(issues[0].better,'My niece is five years old.');
  assert.equal(action({languageAccuracyPassed:false}).queueAdvance,false);
});

test('MICRO 3/8 — Singular/plural fails Language Gate',()=>{
  const issues=Q.detectImportantLanguageIssues('I have one siblings.',items[3],V);
  assert.equal(issues[0].category,'singular_plural');
  assert.equal(issues[0].better,'I have one sibling.');
  assert.equal(action({languageAccuracyPassed:false}).coachAction,'CORRECT_AND_REQUEST_RETRY');
});

test('MICRO 4/8 — Turn Gate keeps every multi-pause fragment silent',()=>{
  for(const fragment of ['My ancestor was a businessman...','My ancestor was a businessman and he...','My ancestor was a businessman and he sold pork...']){
    const result=action({learnerFinished:false,targetProducedIndependently:Q.containsTarget(fragment,'ancestor'),languageAccuracyPassed:false});
    assert.equal(result.coachAction,'WAIT',fragment);assert.equal(result.queueAdvance,false,fragment);assert.equal(result.endCoachTurn,true,fragment);
  }
  assert.equal(Q.isPrematureInterruption({learnerFinished:false,coachTurnAction:'ADVANCE'}),true);
  assert.equal(Q.isPrematureInterruption({learnerFinished:false,coachTurnAction:'WAIT'}),false);
  assert(live.includes('During normal formulation pauses SAY NOTHING'));
});

test('MICRO 5/8 — Target missing forbids advance and the invariant has no shortcut',()=>{
  const utterance='My niece is the daughter of my sister.';
  assert.equal(Q.containsTarget(utterance,'descendant'),false);
  const result=action({targetProducedIndependently:false});
  assert.equal(result.coachAction,'ELICIT_TARGET');assert.equal(result.queueAdvance,false);
  const valid={turnComplete:true,targetProducedIndependently:true,languageAccuracyPassed:true,retryPending:false,hearingResolved:true};
  assert.equal(Q.canAdvanceThreeGates(valid),true);
  for(const [key,value] of [['turnComplete',false],['targetProducedIndependently',false],['languageAccuracyPassed',false],['retryPending',true],['hearingResolved',false]])assert.equal(Q.canAdvanceThreeGates({...valid,[key]:value}),false,key);
});

test('MICRO 6/8 — Coach-given target never passes the Target Gate',()=>{
  const afterCoachSaysWord=action({targetProducedIndependently:false,coachSuppliedAnswer:true});
  assert.equal(afterCoachSaysWord.runtimeState,'TARGET_UNRESOLVED');assert.equal(afterCoachSaysWord.queueAdvance,false);
  const learnerOwnSentence=action({targetProducedIndependently:Q.containsTarget('My niece is a descendant of my sister.','descendant')});
  assert.equal(learnerOwnSentence.queueAdvance,true);
});

test('MICRO 7/8 — Retry patience keeps lock until the whole Retry passes all Gates',()=>{
  const partial=action({learnerFinished:false,retryPhase:true,retryReceived:true,retryFinished:false,retryAccepted:false});
  assert.deepEqual([partial.runtimeState,partial.correctionLock,partial.coachAction,partial.queueAdvance],['AWAITING_RETRY','awaiting_retry','WAIT_FOR_RETRY',false]);
  const finished=action({retryPhase:true,retryReceived:true,retryFinished:true,retryAccepted:true});
  assert.equal(finished.runtimeState,'RESOLVED');assert.equal(finished.queueAdvance,true);
  assert.equal(Q.isPrematureInterruption({learnerFinished:true,coachTurnAction:'ADVANCE'},{learnerRetried:true,retryLearnerFinished:false}),true);
  assert(live.includes('An incorrect, unfinished, or fragment-only Retry stays on CURRENT WORD'));
});

test('MICRO 8/8 — Hearing uncertainty cannot PASS or become invented evidence',()=>{
  const result=action({hearingResolved:false,targetProducedIndependently:true});
  assert.equal(result.runtimeState,'HEARING_UNRESOLVED');assert.equal(result.coachAction,'CLARIFY_HEARING');assert.equal(result.queueAdvance,false);
  assert(live.includes('If audio is unclear'));
  assert(live.includes('Never reconstruct speech'));
  assert(client.includes('premature_interruption'));
});
