import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.27.0';
const vocabulary=['niece','ancestor','descendant','sibling','spouse'];
const lesson={id:'v270-current-word-lock',title:'Family',curriculum:{mainVocabulary:vocabulary.map(term=>({term})),extendedVocabulary:[],grammar:[{rule:'context only'}]}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const fresh=()=>Q.prepare(Q.reconcile(null,items,{speakingSessionId:'v270-session',lessonId:lesson.id,lessonTitle:lesson.title},V),'v270-attempt',V);
const action=over=>Q.decideCurrentWordAction({learnerFinished:true,hearingResolved:true,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:true,retryPending:false,...over});

function evidence(item,index,over={}){
  return {coverageId:item.coverageId,sourceVersion:item.sourceVersion,taskMode:'vocabulary_production',phaseId:'lesson_application',queuePosition:index+1,attemptSequence:index+1,status:'practiced',newPrompt:`Tell me about ${item.target}.`,learnerUtterance:`My ${item.target} lives nearby.`,utteranceReliability:'confirmed',transcriptionIssue:false,semanticGuessUsed:false,learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,independentAfterCoachAnswer:false,targetProducedIndependently:true,targetUsageCorrect:true,blockingErrorRemaining:false,importantLanguageError:false,importantCorrectionCategories:[],currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','RESOLVED'],runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'none',coachTurnAction:'ADVANCE',coachSpeech:'',coachTurnEndedAfterCorrection:false,resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'not_needed',queueUpdated:true},correctionRequired:false,productionQuality:'acceptable',accuracy:null,needsReview:false,praiseGiven:false,notes:'reliable current evidence',...over};
}
function emptyFinal(){return {attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correctionRequired:false,correction:'not_needed',correctionResolved:false,learnerRetried:false,retryUtterance:'',retryLearnerFinished:false,retryUtteranceReliability:'not_applicable',retryTranscriptionIssue:false,runtimeFinalState:'PENDING',correctionLock:'none',correctionTurnSequence:null,retryTurnSequence:null,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],evidenceValid:false};}
function report(rows,over={}){return {type:'SPEAKING_REPORT',schemaVersion:V,speakingSessionId:'v270-session',continuationAttemptId:'v270-attempt',lessonId:lesson.id,completed:false,endReason:'incomplete',stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},speakingMinutes:10,timeBasis:'measured',coverageChecks:rows,speakingCorrections:[],correctionChecks:[],coachExecutionIssues:[],phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'partial',notes:'actual '+phaseId})),runtimeQueue:{totalRequiredCoverage:5,resolvedCoverage:rows.length,remainingCoverage:5-rows.length,currentCoverageId:items[rows.length]?.coverageId||null,currentRequiredItem:items[rows.length]?.coverageId||null,correctionLockCount:0,allEvidenceValid:rows.length===5,sessionState:rows.length===5?'FINAL_CHALLENGE':'REQUIRED_PRACTICE'},finalChallenge:emptyFinal(),...over};}
function correction(item,original,better,retry,over={}){return {target:item.target,coverageId:item.coverageId,original,better,errorSpans:[over.errorSpan||original],reason:over.reason||'Correct the important problem.',correctionScope:over.correctionScope||'language',intentClarified:over.intentClarified??true,resolution:'retried',correctionTurnSequence:2,retryTurnSequence:3,learnerRetried:true,retryUtterance:retry,retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,...over};}

// Four critical micro-tests required before a full Voice session.
test('CRITICAL A 1/4 — kind girl gets Correction plus Retry lock',()=>{
  const utterance='My niece is very kind girl.';
  const issue=Q.detectImportantLanguageIssues(utterance,items[0],V)[0];
  assert.equal(issue.better,'My niece is a very kind girl.');
  const out=action({importantLanguageErrorsResolved:false,retryPending:true});
  assert.equal(out.state,'AWAITING_RETRY');assert.equal(out.queueAdvance,false);assert.equal(out.coachAction,'CORRECT_REMAINING_AND_REQUEST_RETRY');
});

test('CRITICAL B 2/4 — ancestor equals father gets Target Usage correction and Retry',()=>{
  const usage=Q.evaluateTargetUsage(items[1],'My ancestor is my father.');
  assert.equal(usage.value,false);assert.match(usage.reason,/父母|parent/);
  const out=action({targetUsageCorrect:false,importantLanguageErrorsResolved:false,retryPending:true});
  assert.equal(out.state,'AWAITING_RETRY');assert.equal(out.coachAction,'CORRECT_TARGET_USAGE_AND_REQUEST_RETRY');assert.equal(out.queueAdvance,false);
});

test('CRITICAL C 3/4 — slow formulation produces no Coach speech',()=>{
  for(const fragment of ['My niece is...','My niece is a student and...']){
    const out=action({learnerFinished:false,learnerProducedTarget:Q.containsTarget(fragment,'niece'),targetUsageCorrect:null,importantLanguageErrorsResolved:false});
    assert.equal(out.state,'AWAITING_LEARNER');assert.equal(out.coachSpeech,'');assert.equal(out.queueAdvance,false);
  }
  assert(live.includes('During normal formulation pauses SAY NOTHING'));
});

test('CRITICAL D 4/4 — incorrect Retry stays on current word and requests another Retry',()=>{
  const out=action({importantLanguageErrorsResolved:false,retryPending:true});
  assert.equal(out.state,'AWAITING_RETRY');assert.equal(out.coachAction,'CORRECT_REMAINING_AND_REQUEST_RETRY');assert.equal(out.queueAdvance,false);
});

// Twelve scenario regressions from the V2.27.0 specification.
test('REGRESSION 1/12 — clean niece success resolves and allows NEXT',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');assert.deepEqual(Q.LIVE_ITEM_STATES,['PENDING','ACTIVE','AWAITING_LEARNER','NEEDS_SUPPORT','AWAITING_RETRY','RESOLVED','EXPLICITLY_SKIPPED']);
  assert.equal(Q.evaluateTargetUsage(items[0],'My niece is a student and she is very beautiful.').value,true);
  const out=action({});assert.equal(out.state,'RESOLVED');assert.equal(out.queueAdvance,true);
});

test('REGRESSION 2/12 — ancestor meaning error cannot be passed by the server',()=>{
  const original='My ancestor is my father, and he is a businessman.';
  const row=evidence(items[1],1,{learnerUtterance:original,targetUsageCorrect:true});
  const out=Q.applyReport(fresh(),report([row]));
  assert.equal(out.state.queue[1].state,'NOT_YET_PRACTICED');
  assert(out.report.coachExecutionIssues.some(x=>x.type==='target_usage_missed'));
  assert.equal(out.report.coverageChecks[0].targetUsageCorrect,false);
});

test('REGRESSION 3/12 — article error keeps current word in Retry lock',()=>{
  const original='My niece is very kind girl.';
  const row=evidence(items[0],0,{learnerUtterance:original,targetUsageCorrect:true,importantLanguageError:true,productionQuality:'needs_review',correctionRequired:true,blockingErrorRemaining:true,currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','CORRECTION_REQUIRED','AWAITING_RETRY'],runtimeFinalState:'AWAITING_RETRY',evidenceValid:false,correctionLock:'awaiting_retry',coachTurnAction:'CORRECT_AND_REQUEST_RETRY',coachTurnEndedAfterCorrection:true,resolution:{hearing:'clear',targetOrTask:'resolved',recallSupport:'none',correction:'unresolved',queueUpdated:false}});
  const out=Q.applyReport(fresh(),report([row]));
  assert.equal(out.state.queue[0].state,'NOT_YET_PRACTICED');assert.equal(out.state.queue[0].correctionLock,'awaiting_retry');
});

test('REGRESSION 4/12 — slow formulation remains silent until complete',()=>{
  assert.equal(Q.isClearlyUnfinishedUtterance('My niece is a student, and'),true);
  const out=action({learnerFinished:false});assert.equal(out.coachSpeech,'');assert.equal(out.queueAdvance,false);
});

test('REGRESSION 5/12 — unclear descendant audio asks one clarification and stops',()=>{
  const out=action({hearingResolved:false,learnerProducedTarget:false,targetUsageCorrect:null});
  assert.equal(out.state,'NEEDS_SUPPORT');assert.equal(out.coachAction,'CLARIFY_HEARING');assert.equal(out.endCoachTurn,true);assert.equal(out.queueAdvance,false);
});

test('REGRESSION 6/12 — semantic understanding without descendant production stays locked',()=>{
  const utterance="My niece is my cousin's child.";
  assert.equal(Q.containsTarget(utterance,'descendant'),false);assert.equal(Q.evaluateTargetUsage(items[2],utterance).value,null);
  const out=action({learnerProducedTarget:false,targetUsageCorrect:null});assert.equal(out.state,'NEEDS_SUPPORT');assert.equal(out.coachAction,'ELICIT_TARGET');
});

test('REGRESSION 7/12 — abandoned pronoun self-correction is respected',()=>{
  const utterance='My ancestor was my grandfather. I think she... he was a businessman.';
  assert.equal(Q.evaluateTargetUsage(items[1],utterance).value,true);
  assert.equal(Q.detectImportantLanguageIssues(utterance,items[1],V).some(x=>/pronoun/i.test(x.category)),false);
});

test('REGRESSION 8/12 — local language Retry preserves valid sibling evidence',()=>{
  const original='I have one sibling. He is my younger brother, but he is noise.';
  const c=correction(items[3],original,'I have one sibling. He is my younger brother, but he is noisy.','He is noisy.',{errorSpan:'he is noise',correctionScope:'language'});
  assert.equal(Q.retrySatisfiesItem(items[3],c,V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'language'}),true);
  const row=evidence(items[3],3,{learnerUtterance:original,targetUsageCorrect:true,importantLanguageError:true,productionQuality:'needs_review',correctionRequired:true,currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','CORRECTION_REQUIRED','AWAITING_RETRY','EVALUATING_RETRY','RESOLVED'],coachTurnEndedAfterCorrection:true,resolution:{hearing:'clear',targetOrTask:'resolved',recallSupport:'none',correction:'retried',queueUpdated:true}});
  const out=Q.applyReport(fresh(),report([row],{speakingCorrections:[c]}));
  assert.equal(out.report.coverageChecks[0].targetUsageCorrect,true);
});

test('REGRESSION 9/12 — Okay cannot clear a Retry lock',()=>{
  const c=correction(items[0],'My niece is kind girl.','My niece is a kind girl.','Okay',{errorSpan:'kind girl'});
  assert.equal(Q.retrySatisfiesItem(items[0],c,V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'language'}),false);
  const out=action({importantLanguageErrorsResolved:false,retryPending:true});assert.equal(out.state,'AWAITING_RETRY');assert.equal(out.queueAdvance,false);
});

test('REGRESSION 10/12 — one Final Challenge sentence is incomplete',()=>{
  const f={...emptyFinal(),learnerUtterance:'My niece and sibling live nearby.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false};
  const checked=Q.finalChallengeRequirements(f,items);assert.equal(checked.sentenceCount,1);assert.equal(checked.passed,false);
  const out=Q.decideFinalChallengeAction({preFinalAuditPassed:true,learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,sentenceRequirementMet:false,correctionRequired:false});assert.equal(out.coachAction,'ELICIT_MORE_FINAL_SENTENCES');
});

test('REGRESSION 11/12 — Final Challenge correction remains awaiting Learner Retry',()=>{
  const out=Q.decideFinalChallengeAction({preFinalAuditPassed:true,learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,sentenceRequirementMet:true,correctionRequired:true,retryReceived:false,finalAuditPassed:false});
  assert.equal(out.runtimeState,'FINAL_CHALLENGE_AWAITING_RETRY');assert.equal(out.correctionLock,'awaiting_retry');assert.equal(out.completed,false);
});

test('REGRESSION 12/12 — Vocabulary audit returns to descendant before Final Challenge',()=>{
  const queue=items.map((x,i)=>({...x,state:i===2?'NOT_YET_PRACTICED':'PRACTICED',correctionLock:'none',...(i===2?{}:{evidence:{ok:true,evidenceValid:true}})}));
  const audit=Q.completionAuditResponse({queue});assert.equal(audit.coachAction,'RETURN_TO_FIRST_UNRESOLVED');assert.equal(audit.currentCoverageId,items[2].coverageId);assert.equal(Q.canStartFinalChallenge({queue}),false);
});

test('V2.27 semantic correction refuses noise to annoying without intent clarification',()=>{
  const c={original:'He is noise.',better:'He is annoying.',intentClarified:false,errorSpans:['noise']};
  assert.equal(Q.correctionChangesIntentWithoutClarification(c),true);assert.equal(Q.validateCorrection(c).valid,false);
  assert.equal(Q.validateCorrection({...c,intentClarified:true}).valid,true);
});

test('V2.27 prompt separates simple live control from detailed reporting',()=>{
  assert(live.includes('CURRENT WORD IS THE CONTROL CENTER'));assert(live.includes('Detailed Hearing, Target, Language, Correction, and evidence labels belong to the report after Voice ends'));
  assert.equal(items.some(x=>x.kind==='grammar'),false);assert(live.includes('Grammar and Know-how are coaching context'));
});

test('V2.27 resets an unfinished V2.26.1 attempt while preserving its logical session',()=>{
  let state=Q.reconcile(null,items,{speakingSessionId:'migration-session',lessonId:lesson.id,lessonTitle:lesson.title},'2.26.1');
  state=Q.prepare(state,'old-attempt','2.26.1');
  const upgraded=Q.prepare(state,'new-attempt',V);
  assert.equal(upgraded.speakingSessionId,'migration-session');assert.equal(upgraded.activeAttempt.id,'new-attempt');assert.equal(upgraded.activeAttempt.schemaVersion,V);
});

test('V2.27 server rejects a RESOLVED Vocabulary row without targetUsageCorrect=true',()=>{
  const row=evidence(items[0],0);delete row.targetUsageCorrect;
  const out=Q.applyReport(fresh(),report([row]));
  assert.equal(out.state.queue[0].state,'NOT_YET_PRACTICED');assert.equal(out.report.coverageChecks[0].targetUsageCorrect,null);
});
