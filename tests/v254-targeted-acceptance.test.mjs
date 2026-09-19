import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.25.4';
const lesson={id:'targeted-254',title:'Family',curriculum:{
  mainVocabulary:['niece','ancestor','descendant','sibling','spouse'].map(term=>({term})),
  extendedVocabulary:[],
  grammar:[
    {rule:'稱謂後面加上名字時，兩者都需要大寫。'},
    {rule:'直接用稱謂代替人名時要大寫。'},
    {rule:'「誰的＋稱謂」中的稱謂用小寫。'}
  ]
}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const fresh=()=>Q.prepare(Q.reconcile(null,items,{speakingSessionId:'acceptance-session',lessonId:lesson.id,lessonTitle:lesson.title},V),'acceptance-attempt',V);
function grammarExample(item){
  if(item.grammarTask==='title_with_name')return 'Aunt Mary';
  if(item.grammarTask==='title_replacing_name')return 'Mom, can you help me?';
  return 'my mom';
}
function goodEvidence(item,index){
  const example=item.kind==='grammar'?grammarExample(item):'';
  return {
    coverageId:item.coverageId,sourceVersion:item.sourceVersion,taskMode:item.taskMode,
    phaseId:'lesson_application',queuePosition:index+1,attemptSequence:index+1,
    status:'practiced',
    newPrompt:item.kind==='grammar'?`In "${example}", capital or lowercase?`:`Tell me about your ${item.target}.`,
    learnerUtterance:item.kind==='grammar'?(item.expectedAnswer==='lowercase'?'Lowercase.':'Capital.'):`My ${item.target} lives nearby.`,
    utteranceReliability:'confirmed',transcriptionIssue:false,semanticGuessUsed:false,
    learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,independentAfterCoachAnswer:false,
    importantLanguageError:false,importantCorrectionCategories:[],
    currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','RESOLVED'],
    runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'none',
    resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'not_needed',queueUpdated:true},
    correctionRequired:false,productionQuality:item.kind==='vocabulary'?'acceptable':undefined,
    grammarRuleId:item.kind==='grammar'?item.coverageId:undefined,
    grammarTask:item.grammarTask,caseExample:example,
    accuracy:item.kind==='grammar'?'correct':null,needsReview:false,
    ruleApplication:item.kind==='grammar'?'applied server expectedAnswer':'',
    newContext:true,praiseGiven:false,notes:'runtime evidence'
  };
}
function report(rows,over={}){
  return {
    type:'SPEAKING_REPORT',schemaVersion:V,speakingSessionId:'acceptance-session',
    continuationAttemptId:'acceptance-attempt',lessonId:lesson.id,
    completed:false,endReason:'incomplete',
    stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},
    speakingMinutes:10,timeBasis:'measured',coverageChecks:rows,
    speakingCorrections:[],correctionChecks:[],coachExecutionIssues:[],
    phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'partial',notes:'runtime '+phaseId})),
    runtimeQueue:{totalRequiredCoverage:8,resolvedCoverage:rows.length,remainingCoverage:8-rows.length,currentCoverageId:items[rows.length]?.coverageId||null,currentRequiredItem:items[rows.length]?.coverageId||null,correctionLockCount:0,allEvidenceValid:false,sessionState:rows.length===8?'FINAL_CHALLENGE':'REQUIRED_PRACTICE'},
    finalChallenge:{attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correction:'not_needed',correctionResolved:false,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],evidenceValid:false},
    ...over
  };
}

test('TEST 1 niece correction lock and accepted retry transition',()=>{
  const issue=Q.detectImportantLanguageIssues('I have a one niece. She is very kind a girl.',items[0]);
  assert.deepEqual(issue.map(x=>x.category),['important_article_determiner','incomplete_core_sentence_structure']);
  const bad=goodEvidence(items[0],0);bad.learnerUtterance='I have a one niece. She is very kind a girl.';
  const runtime=Q.applyReport(fresh(),report([bad]));
  assert.equal(runtime.state.completedCoverage.length,0);assert.equal(runtime.state.runtimeQueue.currentCoverageId,items[0].coverageId);
  assert.equal(runtime.state.queue[0].runtimeFinalState,'CORRECTION_REQUIRED');assert.equal(runtime.state.queue[0].correctionLock,'required');assert.equal(runtime.state.queue[0].requiredCoachAction,'CORRECT_AND_REQUEST_RETRY');
  const blocked=Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:true,hearingResolved:true,targetOrTaskResolved:true,importantCorrectionRequired:true,correctionIssued:false});
  assert.deepEqual(blocked,{runtimeState:'CORRECTION_REQUIRED',correctionLock:'required',queueAdvance:false,coachAction:'CORRECT_AND_REQUEST_RETRY'});
  const retried=Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:true,hearingResolved:true,targetOrTaskResolved:true,importantCorrectionRequired:true,correctionIssued:true,retryReceived:true,retryFinished:true,retryAccepted:true});
  assert.equal(retried.runtimeState,'RESOLVED');assert.equal(retried.correctionLock,'retried');assert.equal(retried.queueAdvance,true);
});
test('TEST 2 ancestor correction blocks descendant until accepted retry',()=>{
  const issue=Q.detectImportantLanguageIssues('My ancestor sell pork in market.',items[1]);
  assert.deepEqual(issue.map(x=>x.category),['wrong_tense_or_verb_form','important_article_preposition']);
  const first=goodEvidence(items[0],0),bad=goodEvidence(items[1],1);bad.learnerUtterance='My ancestor sell pork in market.';
  const runtime=Q.applyReport(fresh(),report([first,bad]));
  assert.equal(runtime.state.completedCoverage.length,1);assert.equal(runtime.state.runtimeQueue.currentCoverageId,items[1].coverageId);assert.equal(runtime.state.queue[1].correctionLock,'required');
  const blocked=Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:true,hearingResolved:true,targetOrTaskResolved:true,importantCorrectionRequired:true,correctionIssued:true,retryReceived:false,retryFinished:false,retryAccepted:false});
  assert.equal(blocked.runtimeState,'AWAITING_RETRY');assert.equal(blocked.queueAdvance,false);assert.equal(blocked.coachAction,'WAIT_FOR_RETRY');
  assert.equal(Q.retrySatisfiesItem(items[1],{resolution:'retried',learnerRetried:true,retryUtterance:'My ancestor sold pork in the market.',retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false}),true);
});
test('TEST 3 partial Retry stays locked',()=>{
  const paused=Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:true,hearingResolved:true,targetOrTaskResolved:true,importantCorrectionRequired:true,correctionIssued:true,retryReceived:true,retryFinished:false,retryAccepted:false});
  assert.equal(paused.runtimeState,'AWAITING_RETRY');assert.equal(paused.correctionLock,'awaiting_retry');assert.equal(paused.queueAdvance,false);
});
test('TEST 4 correct target with important grammar error is not resolved',()=>{
  const issue=Q.detectImportantLanguageIssues('I have two sibling.',items[3]);
  assert.equal(issue[0].category,'singular_plural');
  const blocked=Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:true,hearingResolved:true,targetOrTaskResolved:true,importantCorrectionRequired:issue.length>0,correctionIssued:false});
  assert.equal(blocked.runtimeState,'CORRECTION_REQUIRED');assert.equal(blocked.queueAdvance,false);
});
test('TEST 5 5/5 Vocabulary transitions to Grammar 1',()=>{
  const out=Q.applyReport(fresh(),report(items.slice(0,5).map(goodEvidence)));
  assert.equal(out.state.completedCoverage.length,5);
  assert.equal(out.state.runtimeQueue.currentCoverageId,items[5].coverageId);
  assert.equal(items[5].grammarTask,'title_with_name');assert.equal(items[5].expectedAnswer,'capital');
});
test('TEST 6 Grammar 1 resolves independently and next is Grammar 2',()=>{
  const out=Q.applyReport(fresh(),report(items.slice(0,6).map(goodEvidence)));
  assert.equal(out.state.runtimeQueue.currentCoverageId,items[6].coverageId);
  assert.equal(items[6].grammarTask,'title_replacing_name');assert.equal(items[6].expectedAnswer,'capital');
  assert.equal(out.state.queue[6].state,'NOT_YET_PRACTICED');
});
test('TEST 7 Grammar 2 resolves independently and next is Grammar 3',()=>{
  const out=Q.applyReport(fresh(),report(items.slice(0,7).map(goodEvidence)));
  assert.equal(out.state.runtimeQueue.currentCoverageId,items[7].coverageId);
  assert.equal(items[7].grammarTask,'possessive_title');assert.equal(items[7].expectedAnswer,'lowercase');
});
test('TEST 8 wrong Grammar answer is locked until correct Retry',()=>{
  const rows=items.slice(0,7).map(goodEvidence), wrong=goodEvidence(items[7],7);
  Object.assign(wrong,{learnerUtterance:'Capital.',accuracy:'incorrect',needsReview:true,importantLanguageError:true,importantCorrectionCategories:['wrong_expected_answer'],correctionRequired:true,currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','CORRECTION_REQUIRED','AWAITING_RETRY'],runtimeFinalState:'AWAITING_RETRY',evidenceValid:false,correctionLock:'awaiting_retry',resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'unresolved',queueUpdated:false}});
  const out=Q.applyReport(fresh(),report([...rows,wrong]));
  assert.equal(out.state.runtimeQueue.currentCoverageId,items[7].coverageId);
  assert.equal(out.report.coverageChecks.find(x=>x.coverageId===items[7].coverageId).accuracy,'incorrect');
  assert.equal(Q.retrySatisfiesItem(items[7],{resolution:'retried',learnerRetried:true,retryUtterance:'Lowercase.',retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false}),true);
});
test('TEST 9 Next cannot skip Required Grammar',()=>{
  const transition=Q.decideCurrentItemTransition({kind:'grammar',learnerFinished:true,hearingResolved:true,targetOrTaskResolved:false,importantCorrectionRequired:false});
  assert.equal(transition.runtimeState,'TASK_UNRESOLVED');assert.equal(transition.queueAdvance,false);assert.equal(transition.coachAction,'ELICIT_CURRENT');
  assert.equal(Q.advanceRequiredQueue([items[5].coverageId,items[6].coverageId],items[5].coverageId,'TASK_UNRESOLVED'),false);
});
test('TEST 10 one remaining Grammar blocks Final Challenge',()=>{
  const rows=items.slice(0,7).map(goodEvidence);
  const out=Q.applyReport(fresh(),report(rows,{completed:true,runtimeQueue:{totalRequiredCoverage:8,resolvedCoverage:7,remainingCoverage:1,currentCoverageId:items[7].coverageId,currentRequiredItem:items[7].coverageId,correctionLockCount:0,allEvidenceValid:false,sessionState:'REQUIRED_PRACTICE'},finalChallenge:{attemptSequence:20,newPrompt:'Final',learnerUtterance:'My sibling visits my niece.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false,feedbackGiven:true,correction:'not_needed',correctionResolved:true,preFinalAuditPassed:true,finalAuditPassed:true,remainingCoverageBeforeChallenge:1,auditedCoverageIds:items.map(x=>x.coverageId),evidenceValid:true}}));
  assert.equal(out.state.completed,false);assert.equal(out.state.finalChallengeStatus,null);assert.equal(out.state.runtimeQueue.currentCoverageId,items[7].coverageId);
});
