import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.31.0';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const base={learnerFinished:true,hearingResolved:true,retryPending:false,finalMode:false,correctionJustDetected:false,retryReceived:false,retryFinished:false,retryAccepted:false,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:true,allWordsResolved:false,vocabularyAuditPassed:false,learnerUtterance:'I finished my complete answer.'};
const decide=over=>Q.liveVoiceRuntimeDecision({...base,...over});
const silence=(utterance,extra={})=>{
  const result=decide({learnerFinished:false,learnerUtterance:utterance,...extra});
  assert.deepEqual(result,{runtimeMode:extra.retryPending?'RETRY':'PRACTICE',turnOwnership:'learner',assistantTurn:false,action:'NO_ASSISTANT_TURN',coachSpeech:''});
};

test('A — incomplete thought keeps absolute silence',()=>silence('My spouse is kind and I think maybe he...'));
test('B — He was fragment keeps absolute silence',()=>{assert.equal(Q.isClearlyUnfinishedUtterance('He was...'),true);silence('He was...');});
test('C — complete first sentence plus open second thought does not transfer turn',()=>silence('My ancestor was a businessman. He was...'));
test('H — hearing the target before answer end does not interrupt',()=>silence('My niece is a student and...'));
test('I — hearing an error before answer end does not interrupt',()=>silence('I have one siblings and...', {importantLanguageErrorsResolved:false}));

test('D — one error cluster returns the complete corrected sentence',()=>{
  const original='My ancestor was a businessman and he is, uh, sell the pork in the market.';
  const issue=Q.detectImportantLanguageIssues(original,{target:'ancestor'},V)[0];
  assert.deepEqual(issue,{
    category:'past_tense_clause_cluster', original,
    better:'My ancestor was a businessman, and he sold pork in the market.',
    reason:'You\'re talking about the past, so use “was” and “sold.” We usually say “sell pork” without “the” when talking about pork in general.'
  });
  const speech=Q.terminalCorrectionText(issue);
  assert.equal(speech,`My sentence:\n${original}\n\nBetter:\n${issue.better}\n\nWhy:\n${issue.reason}\n\nNow try it again.`);
  const out=decide({learnerUtterance:original,importantLanguageErrorsResolved:false,correctionJustDetected:true});
  assert.deepEqual(out,{runtimeMode:'RETRY',turnOwnership:'coach',assistantTurn:true,action:'CORRECT_AND_REQUEST_RETRY',retryPending:true,currentWordLocked:true,nextAllowed:false});
  assert.equal(Q.coachSpeechMatchesAction({action:out.action,speech,schemaVersion:V}).valid,true);
});

test('complete-sentence validator rejects a fragment-only model',()=>{
  const correction={original:'My ancestor was a businessman and he is, uh, sell the pork in the market.',better:'He sold pork in the market.',errorSpans:['he is, uh, sell the pork']};
  assert.equal(Q.validateCorrection(correction,V).valid,false);
  assert.equal(Q.validateCorrection(correction,V).issue,'incomplete_correction_model');
  assert.equal(Q.validateCorrection({...correction,better:'My ancestor was a businessman, and he sold pork in the market.'},V).valid,true);
});

test('Correction turn rejects praise/Next before Retry and requires a terminal response',()=>{
  const baseSpeech='My sentence:\nI have one siblings.\n\nBetter:\nI have one sibling.\n\nWhy:\nUse the singular after one.';
  assert.equal(Q.coachSpeechMatchesAction({action:'CORRECT_AND_REQUEST_RETRY',speech:`${baseSpeech}\n\nNice.\nNow try it again.`,schemaVersion:V}).issue,'correction_retry_bypassed');
  assert.equal(Q.coachSpeechMatchesAction({action:'CORRECT_AND_REQUEST_RETRY',speech:`${baseSpeech}\n\nNow try it again.\nNext.`,schemaVersion:V}).issue,'correction_not_terminal');
});

test('E — Yes after Correction remains locked and says only Try it again',()=>{
  const out=decide({retryPending:true,learnerUtterance:'Yes.',retryReceived:false});
  assert.deepEqual(out,{runtimeMode:'RETRY',turnOwnership:'coach',assistantTurn:true,action:'REQUEST_RETRY',retryPending:true,currentWordLocked:true,nextAllowed:false});
  assert.equal(Q.coachSpeechMatchesAction({action:out.action,speech:'Try it again.',schemaVersion:V}).valid,true);
});

test('F — partial Retry keeps absolute silence',()=>silence('My ancestor was a businessman and he...', {retryPending:true,retryReceived:true,retryFinished:false}));

test('G — only a successful complete Retry can clear the lock before Next',()=>{
  const partial=decide({retryPending:true,learnerFinished:true,learnerUtterance:'My ancestor was a businessman and he...',retryReceived:true,retryFinished:false});
  assert.equal(partial.action,'NO_ASSISTANT_TURN');
  const out=decide({retryPending:true,learnerUtterance:'My ancestor was a businessman, and he sold pork in the market.',retryReceived:true,retryFinished:true,retryAccepted:true});
  assert.equal(out.action,'ADVANCE');
  assert.equal(out.runtimeMode,'PRACTICE');
  assert.equal(out.retryPending,false);
  assert.equal(out.nextAllowed,true);
});

test('positive completion evidence is required and server-derivable',()=>{
  assert.deepEqual(Q.deriveTurnCompletionEvidence({learnerFinished:true,learnerUtterance:'My niece is a student.'}),{positiveCompletionDetected:true,completionBasis:'complete_thought'});
  assert.deepEqual(Q.deriveTurnCompletionEvidence({learnerFinished:true,learnerUtterance:'My niece is a student and...'}),{positiveCompletionDetected:false,completionBasis:'uncertain'});
  assert.equal(decide({turnCompletionEvidence:{positiveCompletionDetected:false,completionBasis:'uncertain'}}).action,'NO_ASSISTANT_TURN');
});

test('V2.31.0 prompt and report contract publish the hard locks',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert.equal(Q.isTurnCompletionCorrectionV231Report({schemaVersion:V}),true);
  for(const phrase of ['DO I HAVE POSITIVE EVIDENCE','WAITING IS BEHAVIOR, NOT SPEECH','CORRECTION UNIT = COMPLETE SENTENCE','Fix every important error in scope','currentWordLocked=true','NO LEARNER RETRY = NO NEXT','incomplete_correction_model','turnCompletionEvidence'])assert(client.includes(phrase),phrase);
  assert(live.split(/\s+/).length<1200,`Live prompt too long: ${live.split(/\s+/).length}`);
});
