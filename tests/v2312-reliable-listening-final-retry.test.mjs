import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.31.2';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));

test('schema publishes V2.31.2 without weakening earlier controllers',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert.equal(Q.isReliableListeningV2312Report({schemaVersion:V}),true);
  assert.equal(Q.isReliableListeningV2312Report({schemaVersion:'2.31.1'}),false);
  assert.equal(Q.isMinimalRuntimePatchV2311Report({schemaVersion:V}),true);
});

test('TEST A — unclear hearing clarifies before Target, meaning, or Grammar',()=>{
  const action=Q.selectNextCoachAction({learnerFinished:true,hearingResolved:false,learnerProducedTarget:false,targetUsageCorrect:null,importantLanguageErrorsResolved:false,retryPending:false});
  assert.equal(action,'CLARIFY_HEARING');
  assert.match(live,/AM I CONFIDENT I HEARD THE IMPORTANT WORDS CORRECTLY/);
  assert.match(live,/IF I NEED TO GUESS/);
});

test('TEST B — correction cannot import the old sold-pork story',()=>{
  const current='My ancestor is a businessman, and she is a salesperson at market.';
  const contaminated={original:current,better:'My ancestor is a businessman, and he sold pork at the market.',errorSpans:['she is a salesperson at market'],intentClarified:false};
  const validation=Q.validateCorrection(contaminated,V);
  assert.equal(validation.valid,false);
  assert.equal(validation.semanticDrift,true);
  assert.equal(validation.issue,'meaning_clarification_required');
  const faithful={original:current,better:'My ancestor is a businessman, and she is a salesperson at the market.',errorSpans:['at market'],intentClarified:false};
  assert.equal(Q.validateCorrection(faithful,V).valid,true);
});

test('My sentence must be a verbatim span of the current reliable utterance',()=>{
  const evidence={learnerUtterance:'My ancestor is a businessman, and she is a salesperson at market.'};
  assert.equal(Q.correctionOriginalIsVerbatim({original:evidence.learnerUtterance},evidence),true);
  assert.equal(Q.correctionOriginalIsVerbatim({original:'My ancestor is a businessman, and she is a salesperson at the market.'},evidence),false);
});

test('TEST C — grammatically correct hate is not softened into annoyed',()=>{
  assert.deepEqual(Q.detectImportantLanguageIssues('I hate him.',{target:'sibling'},V),[]);
  const softened={original:'I hate him.',better:'I get annoyed with him.',errorSpans:['hate'],intentClarified:false};
  assert.equal(Q.correctionChangesIntentWithoutClarification(softened,V),true);
  assert.equal(Q.validateCorrection(softened,V).valid,false);
});

test('TEST D — Final important Grammar error requires Correction and Retry',()=>{
  const items=[
    {kind:'vocabulary',coverageId:'sibling',target:'sibling'},
    {kind:'vocabulary',coverageId:'niece',target:'niece'}
  ];
  const original='My sibling is kind. My niece five years old.';
  const issues=Q.finalChallengeLanguageIssues(original,items,V);
  assert(issues.some(x=>x.category==='missing_be_verb'));
  assert.equal(Q.selectFinalChallengeAction({learnerFinished:true,hearingResolved:true,retryPending:true,correctionJustDetected:true,retryReceived:false,retryFinished:false,retryAccepted:false,importantLanguageErrorsResolved:false,connectedSentenceCount:2,distinctTargetCount:2,sessionCompletionPassed:false}),'CORRECT_AND_REQUEST_RETRY');
  const before=Q.finalChallengeRequirements({learnerUtterance:original,utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false},items);
  assert.equal(before.sentenceRequirementMet,true);
  assert.equal(before.targetRequirementMet,true);
  const retry='My sibling is kind. My niece is five years old.';
  assert.deepEqual(Q.finalChallengeLanguageIssues(retry,items,V),[]);
});

test('TEST E — Final misunderstanding gets a concrete simplified task',()=>{
  assert.match(live,/If she does not understand, ask concretely/);
  assert.match(live,/two or three topic sentences using two practiced words/);
  assert.match(live,/do not repeat abstract wording or give a model answer/);
});

test('Live Brief removes answer priming and keeps abstract Review observation',()=>{
  for(const forbidden of [
    'My ancestor was a businessman, and he sold pork in the market.',
    'If I get married, I will have a spouse.',
    'My niece is a student, and she is a very beautiful girl',
    'My sibling likes my niece',
    'My niece is a descendant of my cousin'
  ])assert.equal(live.includes(forbidden),false,forbidden);
  for(const required of ['CURRENT RELIABLE COMPLETED LEARNER ANSWER','My sentence is verbatim','Better derives from it','meaning_changed_by_correction','LIVE OBSERVATION PRIORITIES — ABSTRACT ONLY'])assert(client.includes(required),required);
  assert(live.split(/\s+/).length<1200,`Live prompt too long: ${live.split(/\s+/).length}`);
});
