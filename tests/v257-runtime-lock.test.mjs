import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.25.7';
const vocabulary=['niece','ancestor','descendant','sibling','spouse'];
const lesson={id:'v257-runtime-lock',title:'Family',curriculum:{mainVocabulary:vocabulary.map(term=>({term})),extendedVocabulary:[],grammar:[{rule:'title with name'}]}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const resolvedItem=(item,utterance)=>({...item,state:'PRACTICED',correctionLock:'none',evidence:{ok:true,evidenceValid:true,runtimeFinalState:'RESOLVED',hearingResolved:true,targetProducedIndependently:true,learnerFinished:true,blockingErrorRemaining:false,correctionLock:'none',learnerUtterance:utterance}});

test('V2.25.7 preserves Vocabulary-only dynamic queues',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert(Q.isRuntimeLockReport({schemaVersion:V}));
  assert.deepEqual(items.map(x=>x.target),vocabulary);
  assert.equal(items.some(x=>x.kind==='grammar'),false);
  for(const count of [5,8,4]){
    const dynamic=Q.inventory({id:'d'+count,curriculum:{mainVocabulary:Array.from({length:count},(_,i)=>({term:'word'+i})),grammar:[{rule:'g'}]}},[],{schemaVersion:V});
    assert.equal(dynamic.length,count);
    assert(dynamic.every(x=>x.kind==='vocabulary'));
  }
});

test('Runtime Advance Guard requires every resolution fact and no correction lock',()=>{
  const valid={runtimeFinalState:'RESOLVED',hearingResolved:true,targetProducedIndependently:true,learnerFinished:true,blockingErrorRemaining:false,correctionLock:'none',evidenceValid:true};
  assert.equal(Q.canAdvanceCurrentItem(valid),true);
  for(const [key,value] of [['runtimeFinalState','AWAITING_RETRY'],['hearingResolved',false],['targetProducedIndependently',false],['learnerFinished',false],['blockingErrorRemaining',true],['correctionLock','awaiting_retry'],['evidenceValid',false]]){
    assert.equal(Q.canAdvanceCurrentItem({...valid,[key]:value}),false,key);
  }
});

test('Correction generator is terminal and cannot append a next action',()=>{
  const output=Q.terminalCorrectionText({original:'He always annoying.',better:'He is always annoying.',reason:'You need “is” before “annoying.”'});
  assert(output.endsWith('Now try it again.'));
  assert.equal(output.includes('spouse'),false);
  assert.equal(output.includes('next question'),false);
});

test('State whitelist forbids correction, retry, and target shortcuts',()=>{
  assert.equal(Q.runtimeHistoryIsValid(['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','RESOLVED']),true);
  assert.equal(Q.runtimeHistoryIsValid(['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','CORRECTION_REQUIRED','AWAITING_RETRY','EVALUATING_RETRY','RESOLVED']),true);
  assert.equal(Q.runtimeHistoryIsValid(['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','TARGET_UNRESOLVED','AWAITING_LEARNER','EVALUATING','RESOLVED']),true);
  assert.equal(Q.runtimeHistoryIsValid(['PENDING','ACTIVE','AWAITING_LEARNER','CORRECTION_REQUIRED','RESOLVED']),false);
  assert.equal(Q.runtimeHistoryIsValid(['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','TARGET_UNRESOLVED','RESOLVED']),false);
  assert.equal(Q.runtimeHistoryIsValid(['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','CORRECTION_REQUIRED','AWAITING_RETRY','RESOLVED']),false);
});

test('Full five-word runtime simulation enforces NO RESOLVE → NO NEXT',()=>{
  const completed=[];
  const clean=input=>Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,importantCorrectionRequired:false,...input});

  // niece: identical correction is rejected, so the valid answer resolves normally.
  const niece='Yes, I have a niece, and she is one year old, and I think she is a very cute girl.';
  assert.equal(Q.detectImportantLanguageIssues(niece,items[0]).length,0);
  assert.equal(Q.validateCorrection({original:niece,better:niece,errorSpans:[]}).valid,false);
  let action=clean();assert.equal(action.queueAdvance,true);assert.equal(action.runtimeState,'RESOLVED');completed.push(resolvedItem(items[0],niece));

  // ancestor: correct answer resolves.
  const ancestor='My ancestor was a businessman and he sold pork in the market.';
  assert.equal(Q.detectImportantLanguageIssues(ancestor,items[1]).length,0);
  action=clean();assert.equal(action.queueAdvance,true);completed.push(resolvedItem(items[1],ancestor));

  // descendant: a concept answer and Coach-supplied word do not resolve; later independent production does.
  action=Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:false,importantCorrectionRequired:false});
  assert.deepEqual({state:action.runtimeState,advance:action.queueAdvance,action:action.coachAction,end:action.endCoachTurn},{state:'TARGET_UNRESOLVED',advance:false,action:'ELICIT_TARGET',end:true});
  const coachSupplied=Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:false,importantCorrectionRequired:false});
  assert.equal(coachSupplied.queueAdvance,false);
  const descendant='My niece is a descendant of my cousin.';
  action=clean();assert.equal(action.queueAdvance,true);completed.push(resolvedItem(items[2],descendant));

  // sibling: correction is terminal; bad Retry stays locked; accepted Retry clears the lock.
  const siblingBad='I have one sibling. It is my younger brother. He always annoying.';
  const siblingIssues=Q.detectImportantLanguageIssues(siblingBad,items[3]);
  assert.equal(siblingIssues.some(x=>x.category==='missing_be_verb'),true);
  assert.equal(siblingIssues.find(x=>x.category==='missing_be_verb').better,'I have one sibling. It is my younger brother. He is always annoying.');
  action=Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,importantCorrectionRequired:true,retryPhase:false});
  assert.deepEqual({state:action.runtimeState,lock:action.correctionLock,advance:action.queueAdvance,action:action.coachAction,end:action.endCoachTurn},{state:'AWAITING_RETRY',lock:'awaiting_retry',advance:false,action:'CORRECT_AND_REQUEST_RETRY',end:true});
  action=Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,importantCorrectionRequired:true,retryPhase:true,retryReceived:true,retryFinished:true,retryAccepted:false});
  assert.equal(action.runtimeState,'AWAITING_RETRY');assert.equal(action.queueAdvance,false);assert.equal(action.endCoachTurn,true);
  action=Q.decideRuntimeAction({learnerFinished:true,hearingResolved:true,targetProducedIndependently:true,importantCorrectionRequired:true,retryPhase:true,retryReceived:true,retryFinished:true,retryAccepted:true});
  assert.equal(action.runtimeState,'RESOLVED');assert.equal(action.correctionLock,'none');assert.equal(action.queueAdvance,true);
  completed.push(resolvedItem(items[3],'I have one sibling. It is my younger brother. He is always annoying.'));

  // spouse: unfinished slow turn waits; complete independent target then resolves.
  action=Q.decideRuntimeAction({learnerFinished:false,hearingResolved:true,targetProducedIndependently:false});
  assert.equal(action.coachAction,'WAIT');assert.equal(action.queueAdvance,false);
  const spouse='If I get married, I want my spouse to be kind and patient.';
  action=clean();assert.equal(action.queueAdvance,true);completed.push(resolvedItem(items[4],spouse));

  const state={queue:completed};
  const audit=Q.fullVocabularyCoverageAudit(state);
  assert.equal(audit.passed,true);assert.equal(audit.resolvedCoverage,5);assert.equal(audit.remainingCoverage,0);assert.equal(Q.canStartFinalChallenge(state),true);

  // Final Challenge correction follows the same terminal lock and separate Retry.
  action=Q.decideFinalChallengeAction({preFinalAuditPassed:true,learnerFinished:true,correctionRequired:true,retryReceived:false,finalAuditPassed:false});
  assert.equal(action.runtimeState,'FINAL_CHALLENGE_AWAITING_RETRY');assert.equal(action.correctionLock,'awaiting_retry');assert.equal(action.completed,false);assert.equal(action.endCoachTurn,true);
  assert.equal(Q.canCompleteSession(state,{runtimeFinalState:'FINAL_CHALLENGE_AWAITING_RETRY',correctionLock:'awaiting_retry',correctionResolved:false,finalAuditPassed:false,evidenceValid:false}),false);
  action=Q.decideFinalChallengeAction({preFinalAuditPassed:true,learnerFinished:true,correctionRequired:true,retryReceived:true,retryFinished:true,retryAccepted:true,finalAuditPassed:true});
  assert.equal(action.runtimeState,'RESOLVED');assert.equal(action.correctionLock,'none');assert.equal(action.completed,true);
  assert.equal(Q.canCompleteSession(state,{runtimeFinalState:'RESOLVED',correctionLock:'none',correctionResolved:true,finalAuditPassed:true,evidenceValid:true}),true);
});

test('Are we finished audit returns to first unresolved item',()=>{
  const partial={queue:[resolvedItem(items[0],'My niece is one year old.'),...items.slice(1).map(x=>({...x,state:'NOT_YET_PRACTICED',correctionLock:'none'}))]};
  const result=Q.completionAuditResponse(partial);
  assert.equal(result.finished,false);assert.equal(result.coachAction,'RETURN_TO_FIRST_UNRESOLVED');assert.equal(result.currentCoverageId,items[1].coverageId);
});

test('V2.25.7 detailed report and runtime fields remain available after Live simplification',()=>{
  const prompt=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
  assert(prompt.includes('B. REPORT CONTRACT — GENERATE ONLY AFTER VOICE ENDS'));
  assert(prompt.includes('targetProducedIndependently'));
  assert(prompt.includes('blockingErrorRemaining'));
  assert(prompt.includes('correctionTurnSequence'));
  assert(prompt.includes('C. SERVER VALIDATION — AFTER REPORT GENERATION'));
});
