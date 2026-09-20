import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.31.1';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const niece={kind:'vocabulary',target:'niece'};

function continuationEvidence(historyOverrides={}) {
  return {
    learnerUtterance:'She is five years old. She is a very beautiful girl.',
    utteranceReliability:'confirmed',
    transcriptionIssue:false,
    learnerFinished:true,
    modelOnly:false,
    coachSuppliedAnswer:false,
    resolution:{hearing:'clear'},
    targetEvidenceHistory:[{
      learnerUtterance:'My niece is a student.',
      utteranceReliability:'confirmed',
      transcriptionIssue:false,
      modelOnly:false,
      coachSuppliedAnswer:false,
      learnerProducedIndependently:true,
      ...historyOverrides
    }]
  };
}

test('schema publishes V2.31.1 as a distinct compatible runtime class',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert.equal(Q.isMinimalRuntimePatchV2311Report({schemaVersion:V}),true);
  assert.equal(Q.isMinimalRuntimePatchV2311Report({schemaVersion:'2.31.0'}),false);
});

test('same-task Target evidence survives a pronoun continuation',()=>{
  const evidence=continuationEvidence();
  assert.equal(Q.hasReliableTargetEvidence(niece,evidence),true);
  assert.equal(Q.taskTargetEvidenceUtterance(niece,evidence),'My niece is a student.');
  assert.equal(Q.selectNextCoachAction({
    learnerFinished:true,hearingResolved:true,targetEvidenceEstablished:true,
    targetUsageCorrect:true,importantLanguageErrorsResolved:true,retryPending:false,
    allWordsResolved:false,vocabularyAuditPassed:false
  }),'ADVANCE');
});

test('Coach-provided or unconfirmed history never establishes Target evidence',()=>{
  assert.equal(Q.hasReliableTargetEvidence(niece,continuationEvidence({coachSuppliedAnswer:true})),false);
  assert.equal(Q.hasReliableTargetEvidence(niece,continuationEvidence({learnerProducedIndependently:false})),false);
  assert.equal(Q.hasReliableTargetEvidence(niece,continuationEvidence({utteranceReliability:'uncertain'})),false);
});

test('spouse future-result correction uses the complete sentence and requires Retry',()=>{
  const original='If I get married, I have a spouse.';
  const issue=Q.detectImportantLanguageIssues(original,{kind:'vocabulary',target:'spouse'},V)[0];
  assert.deepEqual(issue,{
    category:'future_result_tense',original,
    better:'If I get married, I will have a spouse.',
    reason:'You\'re talking about a future result, so “will have” is more natural here.'
  });
  assert.equal(Q.liveVoiceRuntimeDecision({learnerFinished:true,learnerUtterance:original,hearingResolved:true,learnerProducedTarget:true,targetUsageCorrect:true,importantLanguageErrorsResolved:false,correctionJustDetected:true,retryPending:false}).action,'CORRECT_AND_REQUEST_RETRY');
  assert.equal(Q.retrySatisfiesItem({kind:'vocabulary',target:'spouse'},{resolution:'retried',learnerRetried:true,retryLearnerFinished:true,retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,retryUtterance:issue.better},V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'language'}),true);
});

test('correct niece sentence is accepted and an unnecessary tweak is rejected',()=>{
  const original='My niece is a student, and she is a very beautiful girl.';
  assert.deepEqual(Q.detectImportantLanguageIssues(original,niece,V),[]);
  assert.equal(Q.isKnownAcceptableNoCorrectionSentence(original),true);
  assert.equal(Q.isUnnecessaryCorrection({original,better:'My niece is a student, and she is a beautiful girl.'},niece,V),true);
});

test('hearing clarification has priority over Target and grammar decisions',()=>{
  assert.equal(Q.selectNextCoachAction({learnerFinished:true,hearingResolved:false,learnerProducedTarget:false,targetUsageCorrect:false,importantLanguageErrorsResolved:false,retryPending:false}),'CLARIFY_HEARING');
});

test('ancestor error cluster returns one complete corrected sentence',()=>{
  const original='My ancestor was a businessman and he is sold pork in the market.';
  assert.deepEqual(Q.detectImportantLanguageIssues(original,{kind:'vocabulary',target:'ancestor'},V),[{
    category:'past_tense_clause_cluster',original,
    better:'My ancestor was a businessman, and he sold pork in the market.',
    reason:'You\'re talking about the past, so use “sold,” not “is sold.”'
  }]);
});

test('relationship inconsistencies are Usage clarification, not Grammar Retry',()=>{
  const cases=[
    ['niece',"My niece is my cousin's daughter."],
    ['ancestor','My ancestor is my father.'],
    ['descendant','Dinosaurs are descendants of chickens.'],
    ['sibling','My cousin is my sibling.'],
    ['spouse','My boyfriend is my spouse.']
  ];
  for(const [target,utterance] of cases){
    const usage=Q.evaluateTargetUsage({kind:'vocabulary',target},utterance);
    assert.equal(usage.value,false,target);
    assert.equal(usage.issueType,'usage_clarification',target);
  }
  assert.equal(Q.selectNextCoachAction({learnerFinished:true,hearingResolved:true,learnerProducedTarget:true,targetUsageCorrect:false,targetUsageClarificationNeeded:true,importantLanguageErrorsResolved:true,retryPending:false}),'FOLLOW_UP_CURRENT_WORD');
});

test('prompt publishes persistence, listening, Usage separation, and report fields',()=>{
  for(const phrase of [
    'Same-task Target evidence persists through follow-up and Retry',
    'CORRECTION UNIT = COMPLETE SENTENCE',
    'feedbackType=usage_clarification',
    'targetEvidenceHistory',
    'unnecessary_correction',
    'CURRENT RELIABLE COMPLETED LEARNER ANSWER',
    'Preserve correct language, people, relationships, actions, opinions, emotional strength, and facts.'
  ])assert(client.includes(phrase),phrase);
  assert(live.split(/\s+/).length<1200,`Live prompt too long: ${live.split(/\s+/).length}`);
});
