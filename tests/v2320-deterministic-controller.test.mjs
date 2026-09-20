import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.32.0';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const item=target=>({kind:'vocabulary',target,coverageId:target});
const retried=(original,better,retryUtterance=better)=>({resolution:'retried',learnerRetried:true,retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,original,better,retryUtterance,correctionScope:'complete_sentence',retryScope:'complete_sentence'});

test('schema and the one master controller publish the exact eight-gate order',()=>{
  assert.equal(Q.SCHEMA_VERSION,V);
  assert.equal(Q.isDeterministicV232Report({schemaVersion:V}),true);
  assert.equal(Q.isDeterministicV232Report({schemaVersion:'2.31.3'}),false);
  assert.match(live,/ONE MASTER CONTROLLER/);
  assert.match(live,/FINISHED\? → HEARD\? → TARGET\? → MEANING\? → GRAMMAR\? → RETRY\? → RESOLVE\? → NEXT\?/);
  assert.deepEqual(Q.LIVE_RUNTIME_MODES,['PRACTICE','RETRY','FINAL']);
});

test('1 — correct niece resolves without false correction or extra turn probing',()=>{
  const sentence='My niece is five years old and she is very cute.';
  assert.deepEqual(Q.scanWholeAnswerLanguage(sentence,item('niece'),V).issues,[]);
  assert.match(live,/do not ask “Anything else\?”/i);
});

test('2 — thinking pause remains the learner turn and Coach stays silent',()=>{
  const spoken='My ancestor was a businessman...';
  assert.equal(Q.isClearlyUnfinishedUtterance(spoken),true);
  assert.deepEqual(Q.liveVoiceRuntimeDecision({schemaVersion:V,learnerFinished:false,learnerUtterance:spoken}),{runtimeMode:'PRACTICE',turnOwnership:'learner',assistantTurn:false,action:'NO_ASSISTANT_TURN',coachSpeech:''});
});

test('3 — ancestor grammar correction covers the complete sentence',()=>{
  const original='My ancestor is a businessman and he sell beef in the market.';
  const scan=Q.scanWholeAnswerLanguage(original,item('ancestor'),V);
  assert.equal(scan.correctionScope,'complete_sentence');
  assert.equal(scan.correctionOriginal,original);
  assert.equal(scan.correctionBetter,'My ancestor was a businessman and he sold beef in the market.');
});

test('4 — descendant correction keeps Retry locked after acknowledgement',()=>{
  const original='My sister daughter is my sister descendant.';
  const scan=Q.scanWholeAnswerLanguage(original,item('descendant'),V);
  assert.equal(scan.correctionBetter,'My sister’s daughter is my sister’s descendant.');
  const action=Q.liveVoiceRuntimeDecision({schemaVersion:V,learnerFinished:true,learnerUtterance:'So my sentence is correct?',hearingResolved:true,retryPending:true,retryReceived:false});
  assert.equal(action.action,'REQUEST_OR_EVALUATE_RETRY');
  assert.equal(action.retryPending,true);
});

test('5 — sibling correction excludes the already-correct sentence',()=>{
  const original="I have one sibling. He's my brother, and he always annoys.";
  const scan=Q.scanWholeAnswerLanguage(original,item('sibling'),V);
  assert.equal(scan.correctionScope,'complete_sentence');
  assert.equal(scan.correctionOriginal,"He's my brother, and he always annoys.");
  assert.equal(scan.correctionBetter,"He's my brother, and he always annoys me.");
});

test('6 — spouse future result is corrected and cannot be falsely accepted',()=>{
  const original='If I get married, I have a spouse.';
  const scan=Q.scanWholeAnswerLanguage(original,item('spouse'),V);
  assert.equal(scan.correctionBetter,'If I get married, I will have a spouse.');
  assert.equal(Q.selectNextCoachAction({schemaVersion:V,learnerFinished:true,hearingResolved:true,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:false,retryPending:false}),'CORRECT_AND_REQUEST_RETRY');
});

test('7 — uncertain hearing blocks Target and Grammar evaluation',()=>{
  assert.equal(Q.selectNextCoachAction({schemaVersion:V,learnerFinished:true,hearingResolved:false,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:true,retryPending:false}),'CLARIFY_HEARING');
});

test('8 — unclear meaning uses the distinct CLARIFY_USAGE action',()=>{
  assert.equal(Q.selectNextCoachAction({schemaVersion:V,learnerFinished:true,hearingResolved:true,learnerProducedTarget:true,targetUsageCorrect:false,targetUsageClarificationNeeded:true,importantLanguageErrorsResolved:true,retryPending:false}),'CLARIFY_USAGE');
});

test('9 — an unclear Retry cannot pass',()=>{
  const original='If I get married, I have a spouse.';
  const better='If I get married, I will have a spouse.';
  assert.equal(Q.retrySatisfiesItem(item('spouse'),{...retried(original,better),retryUtteranceReliability:'uncertain'},V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'complete_sentence'}),false);
});

test('10 — vocabulary completion audits before mandatory Final',()=>{
  const queue=['niece','ancestor','descendant','sibling','spouse'].map(target=>({kind:'vocabulary',target,coverageId:target,state:'PRACTICED',correctionLock:'none',evidence:{ok:true,evidenceValid:true}}));
  const state={queue};
  assert.equal(Q.fullVocabularyCoverageAudit(state).passed,true);
  assert.equal(Q.canStartFinalChallenge(state),true);
  assert.deepEqual(Q.completionAuditResponse(state).coachAction,'START_FINAL_CHALLENGE');
});

test('11 — Final requires 2–3 sentences, two Targets, full scan, and Retry when needed',()=>{
  const items=[item('niece'),item('sibling')];
  const original='My niece is five years old. My sibling take care of her. They live together.';
  const requirements=Q.finalChallengeRequirements({learnerUtterance:original,utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false},items);
  assert.equal(requirements.sentenceCount,3);
  assert.equal(requirements.targetCount,2);
  assert.equal(Q.finalChallengeLanguageIssues(original,items,V).some(x=>x.category==='third_person_singular'),true);
  assert.match(live,/finalChallengeAttempted/);
  assert.match(live,/finalRetryPending=false/);
});

test('report contract exposes deterministic gates and new Coach issue taxonomy',()=>{
  for(const field of ['hearingReliable:true','importantLanguageErrorsResolved:true','finalChallengeAttempted:false','finalHearingReliable:false','finalImportantErrorsResolved:false','finalRetryPending:false'])assert(client.includes(field),field);
  for(const issue of ['false_acceptance','unclear_retry_accepted','meaning_reconstructed_without_confirmation','premature_final','final_challenge_skipped'])assert(client.includes(issue),issue);
  for(const action of ['WAIT','CLARIFY_HEARING','ELICIT_TARGET','CLARIFY_USAGE','CORRECT_AND_REQUEST_RETRY','REQUEST_OR_EVALUATE_RETRY','ADVANCE'])assert(Q.NEXT_COACH_ACTIONS.includes(action),action);
  assert(live.trim().split(/\s+/).length<1200,`Live prompt too long: ${live.trim().split(/\s+/).length}`);
});
