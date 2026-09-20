import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.30.0';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const base={learnerFinished:true,hearingResolved:true,retryPending:false,finalMode:false,correctionJustDetected:false,retryReceived:false,retryFinished:false,retryAccepted:false,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:true,allWordsResolved:false,vocabularyAuditPassed:false,learnerUtterance:'A complete answer.'};
const decide=over=>Q.liveVoiceRuntimeDecision({...base,...over});

test('TEST 1 — learner turn ownership generates no Assistant turn',()=>{
  const out=decide({learnerFinished:false,learnerUtterance:'My spouse is kind and I think maybe he...'});
  assert.deepEqual(out,{runtimeMode:'PRACTICE',turnOwnership:'learner',assistantTurn:false,action:'NO_ASSISTANT_TURN',coachSpeech:''});
  assert.equal(Q.isClearlyUnfinishedUtterance('My spouse is kind and I think maybe he...'),true);
});

test('TEST 2 — split descendant thought stays silent until complete',()=>{
  assert.equal(Q.isClearlyUnfinishedUtterance('Chicken is a descendant of...'),true);
  assert.equal(decide({learnerFinished:false,learnerUtterance:'Chicken is a descendant of...'}).action,'NO_ASSISTANT_TURN');
  const sentence='Chicken is a descendant of dinosaurs.';
  assert.equal(Q.containsTarget(sentence,'descendant'),true);
  assert.equal(decide({learnerUtterance:sentence}).action,'ADVANCE');
});

test('TEST 3 — important correction enters RETRY and ends the Coach turn',()=>{
  const original='I think always annoying.';
  const issue=Q.detectImportantLanguageIssues(original,{target:'spouse'},V)[0];
  assert.deepEqual(issue,{category:'incomplete_core_sentence_structure',original,better:'I think he is always annoying.',reason:'The sentence needs a subject and “be.”'});
  const out=decide({learnerUtterance:original,importantLanguageErrorsResolved:false,correctionJustDetected:true});
  assert.equal(out.action,'CORRECT_AND_REQUEST_RETRY');
  const speech=Q.terminalCorrectionText({original,better:issue.better,reason:issue.reason});
  assert.equal(Q.coachSpeechMatchesAction({action:out.action,speech,schemaVersion:V}).valid,true);
  assert.match(speech,/Now try it again\.$/);
});

test('TEST 4 — acknowledgement cannot leave RETRY mode',()=>{
  const out=decide({retryPending:true,learnerUtterance:'Yes.',retryReceived:false});
  assert.equal(out.runtimeMode,'RETRY');assert.equal(out.action,'REQUEST_RETRY');
  assert.equal(Q.coachSpeechMatchesAction({action:out.action,speech:'Try it again.',schemaVersion:V}).valid,true);
});

test('TEST 5 — successful Retry clears RETRY mode before progression',()=>{
  const out=decide({retryPending:true,learnerUtterance:'I think he is always annoying.',retryReceived:true,retryFinished:true,retryAccepted:true});
  assert.equal(out.runtimeMode,'PRACTICE');assert.equal(out.action,'ADVANCE');assert.equal(out.assistantTurn,true);
});

test('TEST 6 — target context cannot become ancestor evidence',()=>{
  const utterance='She was a salesperson in the market.';
  assert.equal(Q.containsTarget(utterance,'ancestor'),false);
  const out=decide({learnerUtterance:utterance,learnerProducedTarget:false,targetUsageCorrect:null});
  assert.equal(out.action,'ELICIT_TARGET');
});

test('TEST 7 — hearing uncertainty clarifies before Target scoring',()=>{
  const out=decide({learnerUtterance:'Teeth are the sentence of dinosaurs.',hearingResolved:false,learnerProducedTarget:false,targetUsageCorrect:null});
  assert.equal(out.action,'CLARIFY_HEARING');
});

test('TEST 8 — acceptable niece sentence receives no false correction',()=>{
  const sentence='My niece is a student, and I think she is a very kind girl.';
  assert.deepEqual(Q.detectImportantLanguageIssues(sentence,{target:'niece'},V),[]);
  assert.equal(Q.validateCorrection({original:sentence,better:sentence,errorSpans:['a very kind girl']}).valid,false);
  assert.equal(decide({learnerUtterance:sentence}).action,'ADVANCE');
});

test('TEST 9 — correction source lock rejects invented pork meaning',()=>{
  const original='My ancestor was a salesperson in the market.';
  assert.deepEqual(Q.detectImportantLanguageIssues(original,{target:'ancestor'},V),[]);
  const invented={original,better:'My ancestor sold pork in the market.',errorSpans:['was a salesperson']};
  assert.equal(Q.validateCorrection(invented).valid,false);
  assert.equal(Q.validateCorrection(invented).issue,'meaning_clarification_required');
});

test('TEST 10 — Vocabulary completion enters FINAL rather than completion',()=>{
  const out=decide({allWordsResolved:true,vocabularyAuditPassed:true});
  assert.equal(out.action,'START_FINAL_CHALLENGE');
  const final=decide({finalMode:true,learnerFinished:true,hearingResolved:true,importantLanguageErrorsResolved:true,connectedSentenceCount:1,distinctTargetCount:2,sessionCompletionPassed:false});
  assert.equal(final.runtimeMode,'FINAL');assert.equal(final.action,'CONTINUE_FINAL_CHALLENGE');
});

test('V2.30.0 publishes compact runtime state control and reporting-only fields',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert.deepEqual(Q.LIVE_RUNTIME_MODES,['PRACTICE','RETRY','FINAL']);
  assert.equal(Q.isLiveRuntimeStateV230Report({schemaVersion:V}),true);
  for(const phrase of ['ABSOLUTE LIVE RULES','DO NOT START AN ASSISTANT TURN','Exactly one internal Mode is active: PRACTICE, RETRY, or FINAL','Use the current reliable Learner utterance','Vocabulary completion is not Session completion'])assert(live.includes(phrase),phrase);
  for(const field of ["runtimeMode:'PRACTICE|RETRY'","turnOwnership:'learner|coach'","retryPending:false"])assert(client.includes(field),field);
  assert(live.split(/\s+/).length<1200);
});
