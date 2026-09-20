import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.25.6';
const vocabulary=['niece','ancestor','descendant','sibling','spouse'];
const lesson={id:'v256-stability',title:'Family',curriculum:{
  mainVocabulary:vocabulary.map(term=>({term})),extendedVocabulary:[],
  grammar:[{rule:'title with name'},{rule:'title replacing name'},{rule:'possessive title'}]
}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const fresh=()=>Q.prepare(Q.reconcile(null,items,{speakingSessionId:'v256-session',lessonId:lesson.id,lessonTitle:lesson.title},V),'v256-attempt',V);

function evidence(item,index,over={}){
  return {coverageId:item.coverageId,sourceVersion:item.sourceVersion,taskMode:'vocabulary_production',phaseId:'lesson_application',queuePosition:index+1,attemptSequence:index+1,status:'practiced',newPrompt:`Tell me about your ${item.target}.`,learnerUtterance:`My ${item.target} lives nearby.`,utteranceReliability:'confirmed',transcriptionIssue:false,semanticGuessUsed:false,learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,independentAfterCoachAnswer:false,importantLanguageError:false,importantCorrectionCategories:[],currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','RESOLVED'],runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'none',resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'not_needed',queueUpdated:true},correctionRequired:false,productionQuality:'acceptable',accuracy:null,needsReview:false,praiseGiven:false,notes:'actual evidence',...over};
}
function finalChallenge(over={}){return {attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correction:'not_needed',correctionResolved:false,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],evidenceValid:false,...over};}
function report(rows=[],over={}){return {type:'SPEAKING_REPORT',schemaVersion:V,speakingSessionId:'v256-session',continuationAttemptId:'v256-attempt',lessonId:lesson.id,completed:false,endReason:'incomplete',stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},speakingMinutes:10,timeBasis:'measured',coverageChecks:rows,speakingCorrections:[],correctionChecks:[],coachExecutionIssues:[],phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'partial',notes:'actual '+phaseId})),runtimeQueue:{totalRequiredCoverage:items.length,resolvedCoverage:rows.length,remainingCoverage:items.length-rows.length,currentCoverageId:items[rows.length]?.coverageId||null,currentRequiredItem:items[rows.length]?.coverageId||null,correctionLockCount:0,allEvidenceValid:false,sessionState:rows.length===items.length?'FINAL_CHALLENGE':'REQUIRED_PRACTICE'},finalChallenge:finalChallenge(),...over};}
function correction(item,original,better,errorSpans){return {target:item.target,coverageId:item.coverageId,original,better,errorSpans,reason:'Fix every blocking error in the complete answer.',resolution:'retried',learnerRetried:true,retryUtterance:better,retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,learnerDeclineWords:''};}

test('V2.25.6 globally builds Vocabulary-only dynamic coverage for 5, 8, and 4 word lessons',()=>{
  assert.equal(V,'2.25.6');assert(Q.isVocabularyStabilityReport({schemaVersion:V}));
  for(const [count,grammarCount] of [[5,3],[8,2],[4,4]]){
    const mock={id:`mock-${count}`,curriculum:{mainVocabulary:Array.from({length:count},(_,i)=>({term:`word${i}`})),extendedVocabulary:[],grammar:Array.from({length:grammarCount},(_,i)=>({rule:`rule${i}`}))}};
    const queue=Q.inventory(mock,[],{schemaVersion:V});
    assert.equal(queue.length,count);assert(queue.every(x=>x.kind==='vocabulary'));assert.equal(mock.curriculum.grammar.length,grammarCount);
  }
});

test('Voice controller is English-first and separated from Report generation',()=>{
  const prompt=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
  assert(prompt.includes('A. LIVE SPEAKING BRIEF'));
  assert(prompt.includes('B. REPORT CONTRACT — GENERATE ONLY AFTER VOICE ENDS'));
  assert(prompt.indexOf('A. LIVE SPEAKING BRIEF')<prompt.indexOf('B. REPORT CONTRACT'));
  assert(prompt.includes('START IN ENGLISH'));
  assert(prompt.includes('Do you have a niece? Tell me one thing about her.'));
  assert(prompt.includes('Use Chinese only'));
});

test('Current lesson queue contains all five Vocabulary items in fixed order',()=>{
  assert.deepEqual(items.map(x=>x.target),vocabulary);
  assert.equal(items.filter(x=>x.kind==='grammar').length,0);
  const state=fresh();assert.equal(state.runtimeQueue,undefined);assert.equal(state.activeAttempt.items.length,5);
});

test('Multiple blocking errors are captured together and require one complete acceptable Retry',()=>{
  const original='I have a one niece. She is very kind a girl, and she five years old.';
  const detected=Q.detectImportantLanguageIssues(original,items[0]);
  assert.deepEqual(detected.map(x=>x.category),['important_article_determiner','incomplete_core_sentence_structure','missing_be_verb']);
  const better='I have one niece. She is a very kind girl, and she is five years old.';
  assert.equal(Q.retrySatisfiesItem(items[0],correction(items[0],original,better,['a one','very kind a girl','she five years old']),V),true);
});

test('Correction Lock blocks Next, recast, acknowledgement, and an incorrect Retry',()=>{
  for(const retry of ['', 'Okay.', 'I understand.', 'She very kind girl and she is five years old.']){
    const c={resolution:'retried',learnerRetried:!!retry,retryUtterance:retry,retryLearnerFinished:!!retry,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false};
    assert.equal(Q.retrySatisfiesItem(items[0],c,V),false);
  }
  const blocked=Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:true,hearingResolved:true,targetOrTaskResolved:true,importantCorrectionRequired:true,correctionIssued:true,retryReceived:false,retryFinished:false,retryAccepted:false,allowCorrectionDecline:false});
  assert.equal(blocked.runtimeState,'AWAITING_RETRY');assert.equal(blocked.queueAdvance,false);assert.equal(blocked.coachAction,'WAIT_FOR_RETRY');
});

test('False correction rejects an absent claimed error span without creating a learner correction',()=>{
  const checked=Q.validateCorrection({original:'I have one sibling.',better:'I have one sibling.',errorSpans:['a sibling']});
  assert.equal(checked.valid,false);assert.deepEqual(checked.missingErrorSpans,['a sibling']);
  const row=evidence(items[3],3,{learnerUtterance:'I have one sibling. He is my younger brother.'});
  assert.equal(Q.detectImportantLanguageIssues(row.learnerUtterance,items[3]).length,0);
});

test('Coach-supplied target remains unresolved until independent production',()=>{
  const item=items[3],base=evidence(item,3,{learnerUtterance:'The word is... I am not sure.',coachSuppliedAnswer:true,independentAfterCoachAnswer:false,resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'coach_answer',correction:'not_needed',queueUpdated:false}});
  let assessed=Q.assess(item,base,V);assert.equal(assessed.ok,false);assert.equal(assessed.remainingReason,'model_only');
  assessed=Q.assess(item,{...base,learnerUtterance:'My sibling is my younger brother.',independentAfterCoachAnswer:true,resolution:{...base.resolution,queueUpdated:true}},V);assert.equal(assessed.ok,true);
});

test('Slow learner turn and unclear hearing remain locked without evaluation',()=>{
  assert.deepEqual(Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:false,hearingResolved:true,targetOrTaskResolved:true}),{runtimeState:'AWAITING_LEARNER',correctionLock:'none',queueAdvance:false,coachAction:'WAIT'});
  assert.deepEqual(Q.decideCurrentItemTransition({kind:'vocabulary',learnerFinished:true,hearingResolved:false,targetOrTaskResolved:true}),{runtimeState:'HEARING_UNRESOLVED',correctionLock:'none',queueAdvance:false,coachAction:'CLARIFY_HEARING'});
});

test('5/5 Vocabulary audit gates a Vocabulary-only Final Challenge and accurate Report',()=>{
  let out=Q.applyReport(fresh(),report(items.slice(0,4).map(evidence),{completed:true,finalChallenge:finalChallenge({attemptSequence:20,newPrompt:'Use two words.',learnerUtterance:'My sibling visits my niece.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false,feedbackGiven:true,correction:'not_needed',correctionResolved:true,preFinalAuditPassed:true,finalAuditPassed:true,remainingCoverageBeforeChallenge:1,auditedCoverageIds:items.map(x=>x.coverageId),evidenceValid:true})}));
  assert.equal(out.state.completed,false);assert(out.report.coachExecutionIssues.some(x=>x.type==='coverage_audit_failure'));
  const complete=report(items.map(evidence),{completed:true,runtimeQueue:{totalRequiredCoverage:5,resolvedCoverage:5,remainingCoverage:0,currentCoverageId:null,currentRequiredItem:null,correctionLockCount:0,allEvidenceValid:true,sessionState:'FINAL_CHALLENGE'},phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'completed',notes:'completed '+phaseId})),finalChallenge:finalChallenge({attemptSequence:20,newPrompt:'Use two or three practiced words in 2–3 connected sentences.',learnerUtterance:'My sibling visits my niece. Her spouse joins us too.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false,feedbackGiven:true,correction:'not_needed',correctionResolved:true,preFinalAuditPassed:true,finalAuditPassed:true,remainingCoverageBeforeChallenge:0,auditedCoverageIds:items.map(x=>x.coverageId),evidenceValid:true})});
  out=Q.applyReport(fresh(),complete);
  assert.equal(out.state.completed,true);assert.equal(out.report.coverageChecks.length,5);assert(out.report.coverageChecks.every(x=>x.kind==='vocabulary'));
});

test('Coach execution issues remain separate from learner evidence',()=>{
  const row=evidence(items[0],0,{newPrompt:'你有姪女嗎？ Tell me about your niece.'});
  const out=Q.applyReport(fresh(),report([row],{completed:true}));
  assert(out.report.coachExecutionIssues.some(x=>x.type==='voice_language_violation'));
  assert(out.report.coachExecutionIssues.some(x=>x.type==='premature_session_completion'));
  assert.equal(out.state.queue[0].state,'PRACTICED');
});
