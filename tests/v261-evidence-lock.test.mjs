import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.26.1';
const vocabulary=['niece','ancestor','descendant','sibling','spouse'];
const lesson={id:'v261-evidence-lock',title:'Family',curriculum:{mainVocabulary:vocabulary.map(term=>({term})),extendedVocabulary:[],grammar:[{rule:'context only'}]}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const action=over=>Q.decideRuntimeAction({learnerFinished:true,hearingConfidence:'confirmed',targetProducedIndependently:true,languageAccuracyPassed:true,retryPhase:false,retryReceived:false,retryFinished:false,retryAccepted:false,...over});
const fresh=()=>Q.prepare(Q.reconcile(null,items,{speakingSessionId:'v261-session',lessonId:lesson.id,lessonTitle:lesson.title},V),'v261-attempt',V);

function evidence(item,index,over={}){
  return {coverageId:item.coverageId,sourceVersion:item.sourceVersion,taskMode:'vocabulary_production',phaseId:'lesson_application',queuePosition:index+1,attemptSequence:index+1,status:'practiced',newPrompt:`Tell me about your ${item.target}.`,learnerUtterance:`My ${item.target} lives nearby.`,utteranceReliability:'confirmed',transcriptionIssue:false,semanticGuessUsed:false,learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,independentAfterCoachAnswer:false,targetProducedIndependently:true,blockingErrorRemaining:false,importantLanguageError:false,importantCorrectionCategories:[],currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','RESOLVED'],runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'none',coachTurnAction:'ADVANCE',coachSpeech:'Nice.',coachTurnEndedAfterCorrection:false,resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'not_needed',queueUpdated:true},correctionRequired:false,productionQuality:'acceptable',accuracy:null,needsReview:false,praiseGiven:false,notes:'reliable current evidence',...over};
}
function emptyFinal(){return {attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correctionRequired:false,correction:'not_needed',correctionResolved:false,learnerRetried:false,retryUtterance:'',retryLearnerFinished:false,retryUtteranceReliability:'not_applicable',retryTranscriptionIssue:false,runtimeFinalState:'PENDING',correctionLock:'none',correctionTurnSequence:null,retryTurnSequence:null,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],evidenceValid:false};}
function report(rows,over={}){return {type:'SPEAKING_REPORT',schemaVersion:V,speakingSessionId:'v261-session',continuationAttemptId:'v261-attempt',lessonId:lesson.id,completed:false,endReason:'incomplete',stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},speakingMinutes:10,timeBasis:'measured',coverageChecks:rows,speakingCorrections:[],correctionChecks:[],coachExecutionIssues:[],phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'partial',notes:'actual '+phaseId})),runtimeQueue:{totalRequiredCoverage:5,resolvedCoverage:rows.length,remainingCoverage:5-rows.length,currentCoverageId:items[rows.length]?.coverageId||null,currentRequiredItem:items[rows.length]?.coverageId||null,correctionLockCount:0,allEvidenceValid:rows.length===5,sessionState:rows.length===5?'FINAL_CHALLENGE':'REQUIRED_PRACTICE'},finalChallenge:emptyFinal(),...over};}

test('MICRO 1/10 — open turn produces true silence',()=>{
  const wait=action({learnerFinished:false,targetProducedIndependently:false,languageAccuracyPassed:false});
  assert.equal(wait.coachAction,'WAIT');assert.equal(wait.coachSpeech,'');assert.equal(wait.queueAdvance,false);
  assert.equal(Q.isClearlyUnfinishedUtterance('My niece is five years old, and she is, uh...'),true);
  assert(live.includes('During normal formulation pauses SAY NOTHING'));assert(live.includes('CURRENT WORD STAYS LOCKED UNTIL IT CAN RESOLVE'));
});

test('MICRO 2/10 — unclear Kai girl must clarify before evaluation',()=>{
  const result=action({hearingConfidence:'uncertain'});
  assert.equal(result.coachAction,'CLARIFY_HEARING');assert.equal(result.queueAdvance,false);
  assert(live.includes('Sorry, did you say ‘kind girl’?'));
});

test('MICRO 3/10 — ancestor cannot resolve without quotable target evidence',()=>{
  const row=evidence(items[1],1,{learnerUtterance:'He was a businessman and he sold pork in the market.',targetProducedIndependently:true});
  assert.equal(Q.hasReliableTargetEvidence(items[1],row),false);
  const out=Q.applyReport(fresh(),report([row]));
  assert(out.report.coachExecutionIssues.some(x=>x.type==='target_evidence_mismatch'));
  assert.equal(out.state.queue[1].state,'NOT_YET_PRACTICED');
});

test('MICRO 4/10 — corrupted descendant is uncertain and not proven',()=>{
  const row=evidence(items[2],2,{learnerUtterance:'It is the same tent of my sister.',utteranceReliability:'uncertain',transcriptionIssue:true,resolution:{hearing:'unresolved',clarificationPrompt:'Sorry, did you say descendant?',clarificationResponse:'',targetOrTask:'unresolved',recallSupport:'none',correction:'not_needed',queueUpdated:false}});
  assert.equal(Q.hasReliableTargetEvidence(items[2],row),false);
  const result=action({hearingConfidence:'uncertain',targetProducedIndependently:false});
  assert.equal(result.runtimeState,'HEARING_UNRESOLVED');assert.equal(result.queueAdvance,false);
});

test('MICRO 5/10 — reliable grammar error gets exact correction and Retry lock',()=>{
  const utterance='My niece is very kind girl.';
  const issue=Q.detectImportantLanguageIssues(utterance,items[0],V)[0];
  assert.equal(issue.better,'My niece is a very kind girl.');
  const result=action({languageAccuracyPassed:false});
  assert.equal(result.coachAction,'CORRECT_AND_REQUEST_RETRY');assert.equal(result.correctionLock,'awaiting_retry');assert.equal(result.queueAdvance,false);
  assert(Q.terminalCorrectionText({original:utterance,better:issue.better,reason:'Use “a” before “girl.”'}).endsWith('Now try it again.'));
});

test('MICRO 6/10 — unfinished Retry remains silent and locked',()=>{
  const result=action({learnerFinished:false,retryPhase:true,retryReceived:true,retryFinished:false,retryAccepted:false});
  assert.equal(result.coachSpeech,'');assert.equal(result.coachAction,'WAIT_FOR_RETRY');assert.equal(result.correctionLock,'awaiting_retry');assert.equal(result.queueAdvance,false);
});

test('MICRO 7/10 — Final Challenge correction cannot complete without Retry',()=>{
  const blocked=Q.decideFinalChallengeAction({preFinalAuditPassed:true,learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,sentenceRequirementMet:true,correctionRequired:true,retryReceived:false,finalAuditPassed:false});
  assert.equal(blocked.runtimeState,'FINAL_CHALLENGE_AWAITING_RETRY');assert.equal(blocked.correctionLock,'awaiting_retry');assert.equal(blocked.completed,false);assert.equal(blocked.endCoachTurn,true);
});

test('MICRO 8/10 — Thank you does not clear Final Challenge Retry lock',()=>{
  const blocked=Q.decideFinalChallengeAction({preFinalAuditPassed:true,learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,sentenceRequirementMet:true,correctionRequired:false,retryPending:true,learnerResponseIsThanks:true,finalAuditPassed:false});
  assert.equal(blocked.coachAction,'REQUEST_FINAL_RETRY');assert.equal(blocked.correctionLock,'awaiting_retry');assert.equal(blocked.completed,false);
  assert(live.includes('“Okay” or “Thank you” is not a Retry'));
});

test('MICRO 9/10 — one Final Challenge sentence is insufficient',()=>{
  const one={...emptyFinal(),learnerUtterance:'My niece and my sibling live nearby.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false};
  const checked=Q.finalChallengeRequirements(one,items);
  assert.equal(checked.sentenceCount,1);assert.equal(checked.targetCount,2);assert.equal(checked.passed,false);
  const result=Q.decideFinalChallengeAction({preFinalAuditPassed:true,learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,sentenceRequirementMet:false,correctionRequired:false});
  assert.equal(result.coachAction,'ELICIT_MORE_FINAL_SENTENCES');assert.equal(result.completed,false);
});

test('MICRO 10/10 — Final audit returns to descendant and validates a later full Retry',()=>{
  const resolved=items.map((x,i)=>({...x,state:i===2?'NOT_YET_PRACTICED':'PRACTICED',correctionLock:'none',...(i===2?{}:{evidence:{ok:true,evidenceValid:true}})}));
  const audit=Q.completionAuditResponse({queue:resolved});
  assert.equal(audit.coachAction,'RETURN_TO_FIRST_UNRESOLVED');assert.equal(audit.currentCoverageId,items[2].coverageId);

  const rows=items.map(evidence);
  const baseFinal={attemptSequence:20,newPrompt:'Use 2–3 practiced words in 2–3 connected sentences.',learnerUtterance:'My niece and my sibling lives nearby. My spouse visit them.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false,feedbackGiven:true,correctionRequired:true,correction:'unresolved',correctionResolved:false,learnerRetried:false,retryUtterance:'',retryLearnerFinished:false,retryUtteranceReliability:'not_applicable',retryTranscriptionIssue:false,runtimeFinalState:'FINAL_CHALLENGE_AWAITING_RETRY',correctionLock:'awaiting_retry',correctionTurnSequence:20,retryTurnSequence:null,preFinalAuditPassed:true,finalAuditPassed:false,remainingCoverageBeforeChallenge:0,auditedCoverageIds:items.map(x=>x.coverageId),evidenceValid:false};
  let out=Q.applyReport(fresh(),report(rows,{completed:true,runtimeQueue:{totalRequiredCoverage:5,resolvedCoverage:5,remainingCoverage:0,currentCoverageId:null,currentRequiredItem:null,correctionLockCount:0,allEvidenceValid:true,sessionState:'FINAL_CHALLENGE'},finalChallenge:baseFinal}));
  assert.equal(out.state.completed,false);assert(out.report.coachExecutionIssues.some(x=>x.type==='correction_retry_bypassed'));

  const retry='My niece and my sibling live nearby. My spouse visits them.';
  const retried={...baseFinal,correction:'retried',correctionResolved:true,learnerRetried:true,retryUtterance:retry,retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,runtimeFinalState:'RESOLVED',correctionLock:'none',retryTurnSequence:21,finalAuditPassed:true,evidenceValid:true};
  out=Q.applyReport(fresh(),report(rows,{completed:true,endReason:'completed',runtimeQueue:{totalRequiredCoverage:5,resolvedCoverage:5,remainingCoverage:0,currentCoverageId:null,currentRequiredItem:null,correctionLockCount:0,allEvidenceValid:true,sessionState:'FINAL_CHALLENGE'},phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'completed',notes:'completed '+phaseId})),finalChallenge:retried}));
  assert.equal(out.state.completed,true);assert.equal(out.report.finalChallenge.sentenceRequirementMet,true);assert.equal(out.report.finalChallenge.targetRequirementMet,true);
});
