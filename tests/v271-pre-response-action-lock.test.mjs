import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.27.1';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const base={learnerFinished:true,hearingResolved:true,retryPending:false,correctionJustDetected:false,retryReceived:false,retryFinished:false,retryAccepted:false,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:true,allWordsResolved:false,vocabularyAuditPassed:false};
const choose=over=>Q.selectNextCoachAction({...base,...over});

// The eight deterministic micro-tests requested by the V2.27.1 acceptance plan.
test('MICRO A 1/8 — unfinished sibling formulation selects WAIT and outputs silence',()=>{
  const action=choose({learnerFinished:false,learnerProducedTarget:true,targetUsageCorrect:null,importantLanguageErrorsResolved:false});
  assert.equal(action,'WAIT');
  assert.deepEqual(Q.coachSpeechMatchesAction({action,speech:''}),{valid:true,issue:''});
  assert.equal(Q.coachSpeechMatchesAction({action,speech:'Take your time.'}).issue,'wait_spoke');
});

test('MICRO B 2/8 — niece error selects one terminal correction action',()=>{
  const utterance="I have a niece and she's student and she very beautiful.";
  const issues=Q.detectImportantLanguageIssues(utterance,{target:'niece'},V);
  assert.deepEqual(issues.map(x=>x.category),['important_article_determiner','missing_be_verb']);
  const action=choose({importantLanguageErrorsResolved:false,retryPending:true,correctionJustDetected:true});
  assert.equal(action,'CORRECT_AND_REQUEST_RETRY');
  const speech=`My sentence: ${utterance}\nBetter: I have a niece and she's a student, and she is very beautiful.\nWhy: student needs a, and beautiful needs is.\nNow try it again.`;
  assert.equal(Q.coachSpeechMatchesAction({action,speech}).valid,true);
  assert.equal(Q.coachSpeechMatchesAction({action,speech:speech+' Next question.'}).issue,'correction_not_terminal');
});

test('MICRO C 3/8 — Okay while Retry is pending selects REQUEST_RETRY',()=>{
  assert.equal(choose({retryPending:true,retryReceived:false}),'REQUEST_RETRY');
  assert.equal(Q.coachSpeechMatchesAction({action:'REQUEST_RETRY',speech:'Okay. Next word.'}).issue,'mixed_coach_actions');
});

test('MICRO D 4/8 — ancestor meaning without literal target selects ELICIT_TARGET',()=>{
  assert.equal(Q.containsTarget('My father was a businessman.','ancestor'),false);
  assert.equal(choose({learnerProducedTarget:false,targetUsageCorrect:null}),'ELICIT_TARGET');
});

test('MICRO E 5/8 — ancestor used for father selects Target Usage correction',()=>{
  const usage=Q.evaluateTargetUsage({target:'ancestor'},'My ancestor is my father.');
  assert.equal(usage.value,false);
  assert.equal(choose({learnerProducedTarget:true,targetUsageCorrect:false,importantLanguageErrorsResolved:false}),'CORRECT_AND_REQUEST_RETRY');
});

test('MICRO F 6/8 — incorrect complete Retry remains on current word',()=>{
  const action=choose({retryPending:true,retryReceived:true,retryFinished:true,retryAccepted:false});
  assert.equal(action,'CORRECT_AND_REQUEST_RETRY');
  assert.notEqual(action,'ADVANCE');
});

test('MICRO G 7/8 — unfinished Final Challenge fragment selects silent WAIT',()=>{
  const action=Q.selectFinalChallengeAction({learnerFinished:false,hearingResolved:true,retryPending:false,importantLanguageErrorsResolved:true,connectedSentenceCount:1,distinctTargetCount:2,sessionCompletionPassed:false});
  assert.equal(action,'WAIT');
  assert.equal(Q.coachSpeechMatchesAction({action,speech:''}).valid,true);
});

test('MICRO H 8/8 — incomplete Final Challenge plus Okay continues and cannot wrap up',()=>{
  const action=Q.selectFinalChallengeAction({learnerFinished:true,hearingResolved:true,retryPending:false,importantLanguageErrorsResolved:true,connectedSentenceCount:1,distinctTargetCount:2,sessionCompletionPassed:false});
  assert.equal(action,'CONTINUE_FINAL_CHALLENGE');
  assert.equal(Q.coachSpeechMatchesAction({action,speech:'Great, we can stop here.'}).issue,'premature_wrap_up');
});

test('V2.27.1 action vocabulary is finite and first matching priority wins',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert.equal(Q.isPreResponseActionLockReport({schemaVersion:V}),true);
  assert.equal(new Set(Q.NEXT_COACH_ACTIONS).size,12);
  assert.equal(choose({learnerFinished:false,hearingResolved:false,retryPending:true,learnerProducedTarget:false}),'WAIT');
  assert.equal(choose({hearingResolved:false,retryPending:true,learnerProducedTarget:false}),'CLARIFY_HEARING');
});

test('V2.27.1 known sibling and spouse language cases are detected deterministically',()=>{
  const sibling=Q.detectImportantLanguageIssues('Yes, I have a siblings and he is my younger brother. He always annoying.',{target:'sibling'},V);
  assert.deepEqual(sibling.map(x=>x.category),['singular_plural','missing_be_verb']);
  const spouse=Q.detectImportantLanguageIssues('My boyfriend is my spouse in the future, and he will be marry me.',{target:'spouse'},V);
  assert.deepEqual(spouse.map(x=>x.category),['future_verb_form','modal_verb_form']);
});

test('V2.27.1 action lock remains available for compatible V2.27.1 reports',()=>{
  assert.equal(Q.isPreResponseActionLockReport({schemaVersion:V}),true);
  assert.equal(Q.selectNextCoachAction({...base,learnerFinished:false}),'WAIT');
  assert.equal(Q.coachSpeechMatchesAction({action:'CORRECT_AND_REQUEST_RETRY',speech:'Now try it again.'}).valid,true);
});

test('V2.27.1 completion lock checks every required gate',()=>{
  const complete={allRequiredVocabularyResolved:true,noExplicitSkip:true,vocabularyAuditPassed:true,finalChallengeCompleted:true,finalChallengeRetryCleared:true};
  assert.equal(Q.sessionCompletionCheck(complete),true);
  for(const key of Object.keys(complete))assert.equal(Q.sessionCompletionCheck({...complete,[key]:false}),false,key);
});

test('V2.27.1 server rejects a Coach action that disagrees with resolved evidence',()=>{
  const lesson={id:'v271-server-action',title:'Family',curriculum:{mainVocabulary:[{term:'niece'}],extendedVocabulary:[],grammar:[]}};
  const items=Q.inventory(lesson,[],{schemaVersion:V});
  const state=Q.prepare(Q.reconcile(null,items,{speakingSessionId:'v271-session',lessonId:lesson.id,lessonTitle:lesson.title},V),'v271-attempt',V);
  const item=items[0];
  const row={coverageId:item.coverageId,sourceVersion:item.sourceVersion,taskMode:'vocabulary_production',phaseId:'lesson_application',queuePosition:1,attemptSequence:1,status:'practiced',newPrompt:'Tell me about your niece.',learnerUtterance:'My niece is a student.',utteranceReliability:'confirmed',transcriptionIssue:false,semanticGuessUsed:false,learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,independentAfterCoachAnswer:false,targetProducedIndependently:true,targetUsageCorrect:true,blockingErrorRemaining:false,importantLanguageError:false,importantCorrectionCategories:[],currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','RESOLVED'],runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'none',coachTurnAction:'ELICIT_TARGET',coachSpeech:'Please use niece.',coachTurnEndedAfterCorrection:false,resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'not_needed',queueUpdated:true},correctionRequired:false,productionQuality:'acceptable',accuracy:null,needsReview:false,praiseGiven:false,notes:'reliable evidence'};
  const report={type:'SPEAKING_REPORT',schemaVersion:V,speakingSessionId:'v271-session',continuationAttemptId:'v271-attempt',lessonId:lesson.id,completed:false,endReason:'incomplete',stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},speakingMinutes:1,timeBasis:'measured',phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'partial',notes:'actual '+phaseId})),coverageChecks:[row],speakingCorrections:[],correctionChecks:[],coachExecutionIssues:[],runtimeQueue:{totalRequiredCoverage:1,resolvedCoverage:1,remainingCoverage:0,currentCoverageId:null,currentRequiredItem:null,correctionLockCount:0,allEvidenceValid:true,sessionState:'FINAL_CHALLENGE'},finalChallenge:{attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correctionRequired:false,correction:'not_needed',correctionResolved:false,learnerRetried:false,retryUtterance:'',retryLearnerFinished:false,retryUtteranceReliability:'not_applicable',retryTranscriptionIssue:false,runtimeFinalState:'PENDING',correctionLock:'none',correctionTurnSequence:null,retryTurnSequence:null,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],coachTurnAction:'WAIT',coachSpeech:'',evidenceValid:false}};
  const out=Q.applyReport(state,report);
  assert.equal(out.state.completedCoverage.length,0);
  assert(out.report.coachExecutionIssues.some(x=>x.type==='pre_response_action_mismatch'));
});
