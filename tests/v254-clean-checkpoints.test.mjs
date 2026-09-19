import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.25.4';
const prompt=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const lesson={id:'clean-254',title:'Family',curriculum:{
  mainVocabulary:['niece','ancestor','descendant','sibling','spouse'].map(term=>({term})),
  extendedVocabulary:[],
  grammar:[
    {rule:'稱謂後面加上名字時，兩者都需要大寫。'},
    {rule:'直接用稱謂代替人名時要大寫。'},
    {rule:'「誰的＋稱謂」中的稱謂用小寫。'}
  ]
}};
const items=Q.inventory(lesson,[],{schemaVersion:V});
const fresh=()=>Q.prepare(Q.reconcile(null,items,{speakingSessionId:'clean-session',lessonId:lesson.id,lessonTitle:lesson.title},V),'clean-attempt',V);

function exampleFor(item){
  if(item.grammarTask==='title_with_name')return 'Aunt Mary';
  if(item.grammarTask==='title_replacing_name')return 'Mom, can you help me?';
  if(item.grammarTask==='possessive_title')return 'my mom';
  return '';
}
function evidence(item,index,over={}){
  const example=exampleFor(item);
  const learnerUtterance=item.kind==='grammar'
    ? (item.expectedAnswer==='lowercase'?'Lowercase.':'Capital.')
    : `My ${item.target} lives nearby.`;
  return {
    coverageId:item.coverageId,sourceVersion:item.sourceVersion,
    taskMode:item.taskMode,phaseId:'lesson_application',
    queuePosition:index+1,attemptSequence:index+1,status:'practiced',
    newPrompt:item.kind==='grammar'?`Capital or lowercase in ${example}?`:`Use ${item.target} in a sentence.`,
    learnerUtterance,utteranceReliability:'confirmed',transcriptionIssue:false,
    semanticGuessUsed:false,learnerFinished:true,modelOnly:false,
    coachSuppliedAnswer:false,independentAfterCoachAnswer:false,
    currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','RESOLVED'],
    runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'none',
    resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'not_needed',queueUpdated:true},
    correctionRequired:false,
    productionQuality:item.kind==='vocabulary'?'acceptable':undefined,
    grammarRuleId:item.kind==='grammar'?item.coverageId:undefined,
    grammarTask:item.grammarTask,caseExample:example,
    accuracy:item.kind==='grammar'?'correct':null,needsReview:false,
    ruleApplication:item.kind==='grammar'?'applied rule':'',
    newContext:true,praiseGiven:false,notes:'actual evidence',
    ...over
  };
}
function report(rows=[],over={}){
  return {
    type:'SPEAKING_REPORT',schemaVersion:V,
    speakingSessionId:'clean-session',continuationAttemptId:'clean-attempt',
    lessonId:lesson.id,completed:false,endReason:'incomplete',
    stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},
    speakingMinutes:12,timeBasis:'measured',
    coverageChecks:rows,speakingCorrections:[],correctionChecks:[],coachExecutionIssues:[],
    phaseProgress:Q.PHASES.map(phaseId=>({phaseId,status:'partial',notes:'actual '+phaseId})),
    runtimeQueue:{
      totalRequiredCoverage:items.length,resolvedCoverage:rows.length,
      remainingCoverage:items.length-rows.length,
      currentCoverageId:items[rows.length]?.coverageId||null,
      currentRequiredItem:items[rows.length]?.coverageId||null,
      correctionLockCount:0,allEvidenceValid:false,
      sessionState:rows.length===items.length?'FINAL_CHALLENGE':'REQUIRED_PRACTICE'
    },
    finalChallenge:{
      attemptSequence:null,newPrompt:'',learnerUtterance:'',
      utteranceReliability:'not_applicable',transcriptionIssue:false,
      learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,
      feedbackGiven:false,correction:'not_needed',correctionResolved:false,
      preFinalAuditPassed:false,finalAuditPassed:false,
      remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],evidenceValid:false
    },
    ...over
  };
}
function correction(item,original,better){
  return {
    target:item.target,coverageId:item.coverageId,original,better,
    reason:'Important correction.',resolution:'retried',learnerRetried:true,
    retryUtterance:better,retryLearnerFinished:true,
    retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,
    learnerDeclineWords:''
  };
}

test('01 Voice starts immediately with a real lesson question',()=>{
  assert(prompt.includes('VOICE MODE: begin immediately'));
  assert(prompt.includes('The next Coach turn must contain an actual lesson question.'));
});
test('02 Questions stay simple and I do not understand simplifies the same task',()=>{
  assert(prompt.includes('ASK SIMPLE, NATURAL QUESTIONS'));
  assert(prompt.includes("If the learner says “I don't understand”, simplify the same task"));
});
test('03 Important correction waits for a complete Retry before advance',()=>{
  assert(prompt.includes('Then WAIT for the whole Retry'));
  assert(prompt.includes('CORRECTION → LEARNER RETRY → WAIT.'));
});
test('04 Unclear hearing asks for confirmation and never guesses meaning',()=>{
  assert(prompt.includes('HARD RULE — NO EVALUATION WITHOUT HEARING CONFIRMATION'));
  assert(prompt.includes('Never reconstruct or semantically guess damaged audio'));
});
test('05 First unresolved item remains descendant after niece and ancestor',()=>{
  const out=Q.applyReport(fresh(),report(items.slice(0,2).map(evidence)));
  assert.equal(out.state.runtimeQueue.currentCoverageId,items[2].coverageId);
  assert.equal(items[2].target,'descendant');
});
test('06 Yes or Next continues instead of ending the session',()=>{
  assert(prompt.includes('“Yes” after “shall we continue?” means continue, never wrap up'));
  assert(prompt.includes('Next / Next question / Let\'s continue / Okay / Yeah means continue only after the current item resolves'));
});
test('07 my mom plus Capital is incorrect and remains locked until correction Retry',()=>{
  const rows=items.slice(0,7).map(evidence);
  const item=items[7];
  assert.equal(item.grammarTask,'possessive_title');
  assert.equal(item.expectedAnswer,'lowercase');
  const wrong=evidence(item,7,{
    learnerUtterance:'Capital.',accuracy:'incorrect',needsReview:true,
    correctionRequired:true,
    currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','CORRECTION_REQUIRED','AWAITING_RETRY'],
    runtimeFinalState:'AWAITING_RETRY',evidenceValid:false,correctionLock:'awaiting_retry',
    resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved',skipLearnerWords:'',recallSupport:'none',correction:'unresolved',queueUpdated:false}
  });
  const out=Q.applyReport(fresh(),report([...rows,wrong]));
  assert.equal(out.state.queue[7].state,'NOT_YET_PRACTICED');
  assert.equal(out.state.runtimeQueue.currentCoverageId,item.coverageId);
  assert.equal(out.report.coverageChecks.find(x=>x.coverageId===item.coverageId).accuracy,'incorrect');
});
test('08 Legacy V2.25.4 Grammar coverage IDs remain independently parseable',()=>{
  const grammar=items.filter(x=>x.kind==='grammar');
  assert.equal(new Set(grammar.map(x=>x.coverageId)).size,3);
  assert(!prompt.includes('The three Grammar IDs are three separate tasks.'));
});
test('09 One remaining Coverage item blocks Final Challenge and completion',()=>{
  const rows=items.slice(0,7).map(evidence);
  const r=report(rows,{
    completed:true,
    runtimeQueue:{totalRequiredCoverage:8,resolvedCoverage:7,remainingCoverage:1,currentCoverageId:items[7].coverageId,currentRequiredItem:items[7].coverageId,correctionLockCount:0,allEvidenceValid:false,sessionState:'REQUIRED_PRACTICE'},
    finalChallenge:{attemptSequence:20,newPrompt:'Final',learnerUtterance:'My sibling visits my niece.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false,feedbackGiven:true,correction:'not_needed',correctionResolved:true,preFinalAuditPassed:true,finalAuditPassed:true,remainingCoverageBeforeChallenge:1,auditedCoverageIds:items.map(x=>x.coverageId),evidenceValid:true}
  });
  assert.equal(Q.applyReport(fresh(),r).state.completed,false);
});
test('10 A pause is thinking time and cannot finish the learner turn',()=>{
  assert(prompt.includes('Pauses, “um”, “I think”, “maybe”'));
  const row=evidence(items[0],0,{
    learnerUtterance:'My niece is... um...',learnerFinished:false,status:'not_tested',
    currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','TARGET_UNRESOLVED'],
    runtimeFinalState:'TARGET_UNRESOLVED',evidenceValid:false,correctionLock:'none',
    resolution:{hearing:'clear',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'unresolved',skipLearnerWords:'',recallSupport:'none',correction:'not_needed',queueUpdated:false}
  });
  assert.equal(Q.applyReport(fresh(),report([row])).state.completedCoverage.length,0);
});
