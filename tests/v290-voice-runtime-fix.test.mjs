import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.29.0';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const base={learnerFinished:true,hearingResolved:true,retryPending:false,correctionJustDetected:false,retryReceived:false,retryFinished:false,retryAccepted:false,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:true,allWordsResolved:false,vocabularyAuditPassed:false};
const choose=over=>Q.selectNextCoachAction({...base,...over});

test('A — niece correction ends with Retry and cannot advance',()=>{
  const original="I think she's very beautiful girl.";
  const issue=Q.detectImportantLanguageIssues(original,{target:'niece'},V)[0];
  assert.equal(issue.category,'important_article_determiner');
  assert.equal(issue.better,"I think she's a very beautiful girl.");
  const action=choose({importantLanguageErrorsResolved:false,retryPending:true,correctionJustDetected:true});
  assert.equal(action,'CORRECT_AND_REQUEST_RETRY');
  const speech=Q.terminalCorrectionText({original,better:issue.better,reason:issue.reason});
  assert.match(speech,/Now try it again\.$/);
  assert.equal(Q.coachSpeechMatchesAction({action,speech,schemaVersion:V}).valid,true);
  assert.equal(Q.runtimeLocks({...base,importantLanguageErrorsResolved:false,retryPending:true}).nextAllowed,false);
});

test('B — Okay after correction gets only Try it again',()=>{
  assert.equal(choose({retryPending:true,retryReceived:false}),'REQUEST_RETRY');
  assert.equal(Q.coachSpeechMatchesAction({action:'REQUEST_RETRY',speech:'Try it again.',schemaVersion:V}).valid,true);
  assert.equal(Q.coachSpeechMatchesAction({action:'REQUEST_RETRY',speech:'Okay. Try it again.',schemaVersion:V}).issue,'retry_request_not_exact');
  assert.equal(Q.retrySatisfiesItem({kind:'vocabulary',target:'niece'},{resolution:'retried',learnerRetried:true,retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,retryUtterance:'Okay'},V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'language'}),false);
});

test('C — target-missing ancestor stays locked and invented correction is rejected',()=>{
  const original='She was a salesperson in the market.';
  assert.equal(Q.containsTarget(original,'ancestor'),false);
  assert.equal(choose({learnerProducedTarget:false,targetUsageCorrect:null}),'ELICIT_TARGET');
  assert.equal(Q.runtimeLocks({...base,learnerProducedTarget:false,targetUsageCorrect:null}).targetLocked,true);
  const invented={original,better:'She sold pork in the market.',errorSpans:['salesperson']};
  assert.equal(Q.validateCorrection(invented).valid,false);
  assert.equal(Q.validateCorrection(invented).issue,'meaning_clarification_required');
});

test('D — correct descendant sentence passes to next word',()=>{
  const sentence='My niece is a descendant of my cousin.';
  assert.equal(Q.containsTarget(sentence,'descendant'),true);
  assert.equal(Q.evaluateTargetUsage({target:'descendant'},sentence).value,true);
  assert.deepEqual(Q.detectImportantLanguageIssues(sentence,{target:'descendant'},V),[]);
  assert.equal(choose({}),'ADVANCE');
});

test('E — unfinished sibling waits before singular correction and sets Retry lock',()=>{
  const fragment='I have one siblings and...';
  assert.equal(Q.isClearlyUnfinishedUtterance(fragment),true);
  assert.equal(choose({learnerFinished:false,importantLanguageErrorsResolved:false}),'WAIT');
  assert.deepEqual(Q.runtimeLocks({...base,learnerFinished:false,importantLanguageErrorsResolved:false}),{turnLocked:true,targetLocked:false,retryLocked:false,nextAllowed:false});
  const issue=Q.detectImportantLanguageIssues('I have one siblings and he is younger than me.',{target:'sibling'},V)[0];
  assert.equal(issue.category,'singular_plural');
  assert.equal(issue.better,'I have one sibling and he is younger than me.');
  assert.equal(choose({importantLanguageErrorsResolved:false,retryPending:true,correctionJustDetected:true}),'CORRECT_AND_REQUEST_RETRY');
});

test('F — open spouse turn produces absolute silence',()=>{
  const fragment='My spouse is a handsome guy, and I think he is a very softer man, and...';
  assert.equal(Q.isClearlyUnfinishedUtterance(fragment),true);
  const action=choose({learnerFinished:false,importantLanguageErrorsResolved:false});
  assert.equal(action,'WAIT');
  assert.equal(Q.coachSpeechMatchesAction({action,speech:'',schemaVersion:V}).valid,true);
  assert.equal(Q.coachSpeechMatchesAction({action,speech:'Take your time.',schemaVersion:V}).issue,'wait_spoke');
});

test('G — finished spouse answer gets minimal comparative correction and no completion',()=>{
  const original='My spouse is a handsome guy, and I think he is a very softer man.';
  const issue=Q.detectImportantLanguageIssues(original,{target:'spouse'},V).find(x=>x.category==='comparative_modifier');
  assert.equal(issue.better,'My spouse is a handsome guy, and I think he is a much softer man.');
  const action=choose({allWordsResolved:true,vocabularyAuditPassed:true,importantLanguageErrorsResolved:false,retryPending:true,correctionJustDetected:true});
  assert.equal(action,'CORRECT_AND_REQUEST_RETRY');
  assert.equal(Q.coachSpeechMatchesAction({action,speech:Q.terminalCorrectionText({original,better:issue.better,reason:issue.reason}),schemaVersion:V}).valid,true);
  assert.equal(Q.sessionCompletionCheck({allRequiredVocabularyResolved:true,noExplicitSkip:true,vocabularyAuditPassed:true,finalChallengeCompleted:false,finalChallengeRetryCleared:false}),false);
});

test('H — full Vocabulary starts Final Challenge and cannot complete early',()=>{
  assert.equal(choose({allWordsResolved:true,vocabularyAuditPassed:true}),'START_FINAL_CHALLENGE');
  assert.equal(Q.sessionCompletionCheck({allRequiredVocabularyResolved:true,noExplicitSkip:true,vocabularyAuditPassed:true,finalChallengeCompleted:false,finalChallengeRetryCleared:true}),false);
  assert.equal(Q.selectFinalChallengeAction({learnerFinished:true,hearingResolved:true,retryPending:false,importantLanguageErrorsResolved:true,connectedSentenceCount:1,distinctTargetCount:2,sessionCompletionPassed:false}),'CONTINUE_FINAL_CHALLENGE');
});

test('V2.29.0 runtime remains recognized under the current controller',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert.equal(Q.isVoiceRuntimeFixV229Report({schemaVersion:V}),true);
  for(const phrase of ['ABSOLUTE LIVE RULES','CORRECTION ENTERS RETRY MODE','An incorrect, unfinished, or fragment-only Retry stays on CURRENT WORD','Review Context changes observation priority only'])assert(live.includes(phrase),phrase);
  assert.equal(live.trim().split(/\s+/).length<1200,true);
});
