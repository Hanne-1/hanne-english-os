import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V=Q.SCHEMA_VERSION;
const lesson={id:'v255-vocabulary-only',title:'Family',curriculum:{
  mainVocabulary:['niece','ancestor','descendant','sibling','spouse'].map(term=>({term})),
  extendedVocabulary:[],
  grammar:[
    {rule:'稱謂後面加上名字時，兩者都需要大寫。'},
    {rule:'直接用稱謂代替人名時要大寫。'},
    {rule:'「誰的＋稱謂」中的稱謂用小寫。'}
  ]
}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const fresh=()=>Q.prepare(Q.reconcile(null,items,{speakingSessionId:'v255-session',lessonId:lesson.id,lessonTitle:lesson.title},V),'v255-attempt',V);

function evidence(item,index,over={}){
  return {
    coverageId:item.coverageId,sourceVersion:item.sourceVersion,taskMode:'vocabulary_production',
    phaseId:'lesson_application',queuePosition:index+1,attemptSequence:index+1,status:'practiced',
    newPrompt:`Tell me about your ${item.target}.`,learnerUtterance:`My ${item.target} lives nearby.`,
    utteranceReliability:'confirmed',transcriptionIssue:false,semanticGuessUsed:false,
    learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,independentAfterCoachAnswer:false,
    importantLanguageError:false,importantCorrectionCategories:[],
    currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','RESOLVED'],
    runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'none',
    resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'not_needed',queueUpdated:true},
    correctionRequired:false,productionQuality:'acceptable',accuracy:null,needsReview:false,praiseGiven:false,notes:'runtime evidence',
    ...over
  };
}
function emptyFinal(){return {attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correction:'not_needed',correctionResolved:false,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],evidenceValid:false};}
function report(rows=[],over={}){
  return {
    type:'SPEAKING_REPORT',schemaVersion:V,speakingSessionId:'v255-session',continuationAttemptId:'v255-attempt',lessonId:lesson.id,
    completed:false,endReason:'incomplete',stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},
    speakingMinutes:10,timeBasis:'measured',coverageChecks:rows,speakingCorrections:[],correctionChecks:[],coachExecutionIssues:[],
    phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'partial',notes:'runtime '+phaseId})),
    runtimeQueue:{totalRequiredCoverage:items.length,resolvedCoverage:rows.length,remainingCoverage:items.length-rows.length,currentCoverageId:items[rows.length]?.coverageId||null,currentRequiredItem:items[rows.length]?.coverageId||null,correctionLockCount:0,allEvidenceValid:false,sessionState:rows.length===items.length?'FINAL_CHALLENGE':'REQUIRED_PRACTICE'},
    finalChallenge:emptyFinal(),
    ...over
  };
}
function acceptedCorrection(item,original,better){return {target:item.target,coverageId:item.coverageId,original,better,reason:'Important correction.',resolution:'retried',learnerRetried:true,retryUtterance:better,retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,learnerDeclineWords:''};}

test('Vocabulary-only queue contains 5 Vocabulary and zero Grammar',()=>{
  assert.equal(V,'2.25.5');
  assert.equal(items.length,5);
  assert.deepEqual(items.map(x=>x.target),['niece','ancestor','descendant','sibling','spouse']);
  assert.equal(items.filter(x=>x.kind==='grammar').length,0);
  const dynamic=Q.inventory({id:'dynamic',curriculum:{mainVocabulary:['a','b','c','d','e','f','g'].map(term=>({term})),grammar:[{rule:'g1'}]}},[],{schemaVersion:V});
  assert.equal(dynamic.length,7);
});

test('Correction Lock requires a complete accepted Learner Retry',()=>{
  const bad=evidence(items[3],3,{learnerUtterance:'I have two sibling.',importantLanguageError:true,importantCorrectionCategories:['singular_plural'],correctionRequired:true,currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','CORRECTION_REQUIRED','AWAITING_RETRY'],runtimeFinalState:'AWAITING_RETRY',evidenceValid:false,correctionLock:'awaiting_retry',resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'unresolved',queueUpdated:false}});
  const prefix=items.slice(0,3).map(evidence);
  let out=Q.applyReport(fresh(),report([...prefix,bad]));
  assert.equal(out.state.runtimeQueue.currentCoverageId,items[3].coverageId);
  assert.equal(out.state.queue[3].correctionLock,'awaiting_retry');
  assert.equal(out.state.completedCoverage.length,3);
  const corrected={...bad,currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','CORRECTION_REQUIRED','AWAITING_RETRY','RESOLVED'],runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'retried',resolution:{...bad.resolution,correction:'retried',queueUpdated:true}};
  const retried=report([...prefix,corrected]);
  retried.speakingCorrections=[acceptedCorrection(items[3],'I have two sibling.','I have two siblings.')];
  out=Q.applyReport(fresh(),retried);
  assert.equal(out.state.completedCoverage.length,4);
});

test('Coach recast or correction decline is not Learner Retry evidence',()=>{
  assert.equal(Q.retrySatisfiesItem(items[1],{resolution:'retried',learnerRetried:false,retryUtterance:'My ancestor sold pork in the market.',retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false}),false);
  const transition=Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:true,hearingResolved:true,targetOrTaskResolved:true,importantCorrectionRequired:true,correctionIssued:true,retryReceived:false,retryFinished:false,retryAccepted:false,explicitDecline:true,allowCorrectionDecline:false});
  assert.equal(transition.runtimeState,'AWAITING_RETRY');
  assert.equal(transition.queueAdvance,false);
});

test('False correction is retracted and stored only as Coach execution issue',()=>{
  const same='I have one sibling.';
  assert.equal(Q.validateCorrection({original:same,better:same}).valid,false);
  const row=evidence(items[0],0,{learnerUtterance:same,correctionRequired:true,productionQuality:'needs_review',currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','CORRECTION_REQUIRED','RESOLVED'],runtimeFinalState:'RESOLVED',resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'retried',queueUpdated:true}});
  const r=report([row]);r.speakingCorrections=[acceptedCorrection(items[0],same,same)];
  const out=Q.applyReport(fresh(),r);
  assert.equal(out.report.speakingCorrections.length,0);
  assert(out.report.coachExecutionIssues.some(x=>x.type==='false_correction'));
});

test('Target meaning without independent target production remains unresolved',()=>{
  const spouse=items[4];
  const a=Q.assess(spouse,evidence(spouse,4,{learnerUtterance:'A good partner should support you.',resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'unresolved',skipLearnerWords:'',recallSupport:'natural_followup',correction:'not_needed',queueUpdated:false}}),V);
  assert.equal(a.ok,false);assert.equal(a.remainingReason,'target_not_produced');
});

test('Next is continue and cannot skip the unresolved Vocabulary item',()=>{
  const a=Q.assess(items[0],evidence(items[0],0,{status:'not_tested',learnerUtterance:'Next question.',resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'explicit_skip',skipLearnerWords:'Next question.',recallSupport:'none',correction:'not_needed',queueUpdated:false}}),V);
  assert.equal(a.ok,false);assert.equal(a.remainingReason,'target_not_produced');
  assert.equal(Q.advanceRequiredQueue([items[0].coverageId,items[1].coverageId],items[0].coverageId,'TARGET_UNRESOLVED'),false);
});

test('Vocabulary audit requires all 5 items and no Correction Lock',()=>{
  let out=Q.applyReport(fresh(),report(items.slice(0,4).map(evidence)));
  let audit=Q.fullVocabularyCoverageAudit(out.state);
  assert.equal(audit.resolvedCoverage,4);assert.equal(audit.remainingCoverage,1);assert.equal(audit.passed,false);
  out=Q.applyReport(fresh(),report(items.map(evidence)));
  audit=Q.fullVocabularyCoverageAudit(out.state);
  assert.equal(audit.totalRequiredCoverage,5);assert.equal(audit.resolvedCoverage,5);assert.equal(audit.remainingCoverage,0);assert.equal(audit.correctionLockCount,0);assert.equal(audit.passed,true);
  assert.equal(out.report.coverageChecks.length,5);assert(!out.report.coverageChecks.some(x=>x.kind==='grammar'));
});

test('Final Challenge is blocked at 4/5 and completes only after the 5/5 audit',()=>{
  const premature=report(items.slice(0,4).map(evidence),{completed:true,finalChallenge:{attemptSequence:20,newPrompt:'Tell me about your family.',learnerUtterance:'My sibling visits my niece.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false,feedbackGiven:true,correction:'not_needed',correctionResolved:true,preFinalAuditPassed:true,finalAuditPassed:true,remainingCoverageBeforeChallenge:1,auditedCoverageIds:items.map(x=>x.coverageId),evidenceValid:true}});
  assert.equal(Q.applyReport(fresh(),premature).state.completed,false);
  const complete=report(items.map(evidence),{completed:true,runtimeQueue:{totalRequiredCoverage:5,resolvedCoverage:5,remainingCoverage:0,currentCoverageId:null,currentRequiredItem:null,correctionLockCount:0,allEvidenceValid:true,sessionState:'FINAL_CHALLENGE'},phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'completed',notes:'completed '+phaseId})),finalChallenge:{attemptSequence:20,newPrompt:'Tell me about your family in 2–3 sentences and use two words from today.',learnerUtterance:'My sibling often visits my niece. Her spouse joins us too.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false,feedbackGiven:true,correction:'not_needed',correctionResolved:true,preFinalAuditPassed:true,finalAuditPassed:true,remainingCoverageBeforeChallenge:0,auditedCoverageIds:items.map(x=>x.coverageId),evidenceValid:true}});
  const out=Q.applyReport(fresh(),complete);
  assert.equal(out.state.completed,true);assert.equal(out.state.runtimeQueue.totalRequiredCoverage,5);assert.equal(out.state.runtimeQueue.sessionState,'COMPLETED');
});

test('Current Speaking Brief is shorter and contains no Grammar Required Coverage runtime',()=>{
  const prompt=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
  assert(prompt.includes('Required Coverage is Vocabulary only'));
  assert(prompt.includes('fullVocabularyCoverageAudit()'));
  for(const removed of ['VOCABULARY → GRAMMAR TRANSITION','Grammar Success Gate','expectedAnswer=capital','three separate tasks'])assert(!prompt.includes(removed));
});
