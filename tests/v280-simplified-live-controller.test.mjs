import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.28.0';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const base={learnerFinished:true,hearingResolved:true,retryPending:false,correctionJustDetected:false,retryReceived:false,retryFinished:false,retryAccepted:false,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:true,allWordsResolved:false,vocabularyAuditPassed:false};
const choose=over=>Q.selectNextCoachAction({...base,...over});

// Twelve required regression tests from the V2.28.0 acceptance plan.
test('TEST 1/12 — open sibling turn produces silence',()=>{
  assert.equal(Q.isClearlyUnfinishedUtterance('I have a sibling and...'),true);
  const action=choose({learnerFinished:false});
  assert.equal(action,'WAIT');assert.equal(Q.coachSpeechMatchesAction({action,speech:''}).valid,true);
  assert.equal(Q.coachSpeechMatchesAction({action,speech:'Take your time.'}).issue,'wait_spoke');
});

test('TEST 2/12 — long formulation remains open through every fragment',()=>{
  for(const fragment of ['My niece is...','a student and...']){
    assert.equal(Q.isClearlyUnfinishedUtterance(fragment),true,fragment);
    assert.equal(choose({learnerFinished:false}),'WAIT');
  }
  assert.equal(Q.isClearlyUnfinishedUtterance('she is very quiet.'),false);
});

test('TEST 3/12 — acceptable quiet sentence receives no false correction',()=>{
  const sentence='My niece is a student and she is a very quiet girl.';
  assert.deepEqual(Q.detectImportantLanguageIssues(sentence,{target:'niece'},V),[]);
  assert.equal(choose({}),'ADVANCE');
  assert.equal(Q.validateCorrection({original:sentence,better:sentence,errorSpans:['quiet']}).valid,false);
});

test('TEST 4/12 — real article error gets terminal correction and no Next',()=>{
  const sentence='My niece is very kind girl.';
  const issue=Q.detectImportantLanguageIssues(sentence,{target:'niece'},V)[0];
  assert.equal(issue.category,'important_article_determiner');
  assert.equal(issue.better,'My niece is a very kind girl.');
  const action=choose({importantLanguageErrorsResolved:false,retryPending:true,correctionJustDetected:true});
  assert.equal(action,'CORRECT_AND_REQUEST_RETRY');
  const speech=`My sentence: ${sentence}\nBetter: ${issue.better}\nWhy: A singular countable noun needs an article.\nNow try it again.`;
  assert.equal(Q.coachSpeechMatchesAction({action,speech}).valid,true);
});

test('TEST 5/12 — Okay is not Retry and cannot advance',()=>{
  assert.equal(choose({retryPending:true,retryReceived:false}),'REQUEST_RETRY');
  assert.equal(Q.retrySatisfiesItem({kind:'vocabulary',target:'niece'},{resolution:'retried',learnerRetried:true,retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,retryUtterance:'Okay'},V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'language'}),false);
});

test('TEST 6/12 — ancestor description without literal target stays unresolved',()=>{
  const utterance='He was a businessman and sold products in the market.';
  assert.equal(Q.containsTarget(utterance,'ancestor'),false);
  assert.equal(choose({learnerProducedTarget:false,targetUsageCorrect:null}),'ELICIT_TARGET');
});

test('TEST 7/12 — ancestor used for father requires correction and Retry',()=>{
  const usage=Q.evaluateTargetUsage({target:'ancestor'},'My ancestor is my father.');
  assert.equal(usage.value,false);
  assert.equal(choose({targetUsageCorrect:false,importantLanguageErrorsResolved:false}),'CORRECT_AND_REQUEST_RETRY');
});

test('TEST 8/12 — damaged descendant speech clarifies without inference',()=>{
  assert.equal(Q.containsTarget('My niece is a stands of my cousin.','descendant'),false);
  assert.equal(choose({hearingResolved:false,learnerProducedTarget:false,targetUsageCorrect:null}),'CLARIFY_HEARING');
});

test('TEST 9/12 — sibling open turn delays singular correction',()=>{
  const fragment='Yes, I have a siblings and...';
  assert.equal(Q.isClearlyUnfinishedUtterance(fragment),true);
  assert.equal(choose({learnerFinished:false,importantLanguageErrorsResolved:false}),'WAIT');
  assert.equal(Q.detectImportantLanguageIssues('Yes, I have a siblings and he is my younger brother.',{target:'sibling'},V)[0].category,'singular_plural');
});

test('TEST 10/12 — Final Challenge fragment receives silent WAIT',()=>{
  assert.equal(Q.isClearlyUnfinishedUtterance('My sibling...'),true);
  const action=Q.selectFinalChallengeAction({learnerFinished:false,hearingResolved:true,retryPending:false,importantLanguageErrorsResolved:true,connectedSentenceCount:0,distinctTargetCount:1,sessionCompletionPassed:false});
  assert.equal(action,'WAIT');assert.equal(Q.coachSpeechMatchesAction({action,speech:''}).valid,true);
});

test('TEST 11/12 — one Final Challenge sentence requests another sentence',()=>{
  const action=Q.selectFinalChallengeAction({learnerFinished:true,hearingResolved:true,retryPending:false,importantLanguageErrorsResolved:true,connectedSentenceCount:1,distinctTargetCount:2,sessionCompletionPassed:false});
  assert.equal(action,'CONTINUE_FINAL_CHALLENGE');
});

test('TEST 12/12 — incomplete Final Challenge forbids wrap-up',()=>{
  const action=Q.selectFinalChallengeAction({learnerFinished:true,hearingResolved:true,retryPending:false,importantLanguageErrorsResolved:true,connectedSentenceCount:1,distinctTargetCount:1,sessionCompletionPassed:false});
  assert.equal(action,'CONTINUE_FINAL_CHALLENGE');
  assert.equal(Q.coachSpeechMatchesAction({action,speech:'If you would like, we can wrap up.'}).issue,'premature_wrap_up');
});

test('V2.28.0 uses the simplified live loop while preserving detailed reporting',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');assert.equal(Q.isSimplifiedLiveControllerV228Report({schemaVersion:V}),true);
  for(const phrase of ['LISTEN → ENTIRE ANSWER FINISHED?','DO I HAVE POSITIVE EVIDENCE THAT SHE HAS FINISHED HER ENTIRE ANSWER?','HEARING → TARGET → TARGET USAGE → COMPLETE-ANSWER LANGUAGE SCAN → COMPLETE-SENTENCE CORRECTION → MATCHED-SCOPE RETRY → NEXT','LET THE LEARNER FINISH THE ENTIRE FINAL ANSWER FIRST','NO SUCCESSFUL RETRY = NO NEXT'])assert(live.includes(phrase),phrase);
  assert(!live.includes('NEXT_COACH_ACTION must be exactly one of'));
  assert(client.includes('runtimeFinalState'));assert(client.includes('targetProducedIndependently'));assert(client.includes('errorSpans'));
});
