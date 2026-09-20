import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/speaking-queue.js';

const Q=globalThis.EnglishSpeakingQueue;
const V='2.31.3';
const client=fs.readFileSync(new URL('../src/speaking-client.js',import.meta.url),'utf8');
const live=client.slice(client.indexOf('A. LIVE SPEAKING BRIEF'),client.indexOf('B. REPORT CONTRACT'));
const ancestor={kind:'vocabulary',target:'ancestor'};
const niece={kind:'vocabulary',target:'niece'};

const retried={
  resolution:'retried',learnerRetried:true,retryLearnerFinished:true,
  retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false
};

test('schema publishes V2.31.3 complete-answer sentence-scope runtime',()=>{
  assert.equal(Q.SCHEMA_VERSION,'2.32.0');
  assert.equal(Q.isWholeAnswerV2313Report({schemaVersion:V}),true);
  assert.equal(Q.isWholeAnswerV2313Report({schemaVersion:'2.31.2'}),false);
});

test('1 — pauses and open clauses keep the learner turn open and silent',()=>{
  assert.equal(Q.isClearlyUnfinishedUtterance('My ancestor was a businessman...'),true);
  assert.equal(Q.isClearlyUnfinishedUtterance('And he sold pork...'),true);
  assert.match(live,/SAY NOTHING/);
  assert.match(live,/WAITING IS BEHAVIOR, NOT SPEECH/);
});

test('2 — complete answer scan finds every later erroneous sentence',()=>{
  const original='My ancestor was a businessman. He sell pork at market. I think he very hardworking.';
  const scan=Q.scanWholeAnswerLanguage(original,ancestor,V);
  assert.equal(scan.completeAnswerScanned,true);
  assert.equal(scan.correctionScope,'multiple_complete_sentences');
  assert.equal(scan.correctionOriginal,'He sell pork at market. I think he very hardworking.');
  assert.equal(scan.correctionBetter,'He sold pork at the market. I think he was very hardworking.');
  assert.deepEqual(scan.incorrectSentences.map(x=>x.sentenceIndex),[1,2]);
  assert.deepEqual(scan.issues.map(x=>x.category),['wrong_tense_or_verb_form','important_article_preposition','missing_be_verb']);
});

test('3 — correction unit is the complete sentence, never a fragment',()=>{
  const scan=Q.scanWholeAnswerLanguage('I think he very hardworking.',ancestor,V);
  assert.equal(scan.correctionOriginal,'I think he very hardworking.');
  assert.equal(scan.correctionBetter,'I think he was very hardworking.');
  assert.equal(scan.correctionScope,'complete_sentence');
  assert.equal(Q.correctionMatchesSentenceScope({original:'he very hardworking',better:'he was very hardworking',correctionScope:'complete_sentence'},scan),false);
  assert.equal(Q.correctionMatchesSentenceScope({original:scan.correctionOriginal,better:scan.correctionBetter,correctionScope:scan.correctionScope},scan),true);
});

test('4 — correct sentences are excluded from correction and Retry',()=>{
  const original='My ancestor was a businessman. I think he very hardworking.';
  const scan=Q.scanWholeAnswerLanguage(original,ancestor,V);
  assert.equal(scan.correctionOriginal,'I think he very hardworking.');
  const c={...retried,original:scan.correctionOriginal,better:scan.correctionBetter,correctionScope:'complete_sentence',retryScope:'complete_sentence'};
  assert.equal(Q.retrySatisfiesItem(ancestor,{...c,retryUtterance:'I think he was very hardworking.'},V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'complete_sentence'}),true);
  assert.equal(Q.correctionMatchesSentenceScope({...c,original,better:'My ancestor was a businessman. I think he was very hardworking.'},scan),false);
});

test('5 — multiple errors in one sentence are corrected together',()=>{
  const scan=Q.scanWholeAnswerLanguage('My ancestor is businessman and he sell pork at market.',ancestor,V);
  assert.equal(scan.correctionScope,'complete_sentence');
  assert.equal(scan.incorrectSentences.length,1);
  assert.deepEqual(scan.issues.map(x=>x.category),['past_tense_article','wrong_tense_or_verb_form','important_article_preposition']);
  assert.equal(scan.correctionBetter,'My ancestor was a businessman and he sold pork at the market.');
});

test('6 — self-correction uses the learner final intended form',()=>{
  const scan=Q.scanWholeAnswerLanguage('My ancestor is—sorry—was a businessman.',ancestor,V);
  assert.equal(scan.selfCorrectionDetected,true);
  assert.equal(scan.intended,'My ancestor was a businessman.');
  assert.equal(scan.correctionScope,'none');
  assert.deepEqual(scan.issues,[]);
});

test('7 — current reliable pork speech remains valid current evidence',()=>{
  assert.deepEqual(Q.scanWholeAnswerLanguage('He sold pork at the market.',ancestor,V).issues,[]);
});

test('8 — strong intended language is preserved',()=>{
  assert.deepEqual(Q.scanWholeAnswerLanguage('I hate my brother.',{kind:'vocabulary',target:'sibling'},V).issues,[]);
  assert.equal(Q.validateCorrection({original:'I hate my brother.',better:'I get annoyed with my brother.',errorSpans:['hate'],intentClarified:false},V).valid,false);
});

test('9 — retry scope must equal correction scope and cannot be a fragment',()=>{
  const c={...retried,original:'I think he very hardworking.',better:'I think he was very hardworking.',correctionScope:'complete_sentence',retryScope:'complete_sentence'};
  assert.equal(Q.retrySatisfiesItem(ancestor,{...c,retryUtterance:'was very hardworking'},V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'complete_sentence'}),false);
  assert.equal(Q.retrySatisfiesItem(ancestor,{...c,retryScope:'multiple_complete_sentences',retryUtterance:'I think he was very hardworking.'},V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'complete_sentence'}),false);
});

test('10 — natural equivalent scoped Retry may pass',()=>{
  const c={...retried,original:'I think he very hardworking.',better:'I think he was very hardworking.',correctionScope:'complete_sentence',retryScope:'complete_sentence'};
  assert.equal(Q.retrySatisfiesItem(ancestor,{...c,retryUtterance:'I think he was a hardworking person.'},V,{originalTargetEvidenceValid:true,originalTargetUsageCorrect:true,correctionScope:'complete_sentence'}),true);
});

test('11 — Final scans all sentences and isolates only the erroneous sentence',()=>{
  const original='My niece is five years old. My sibling take care of her. They live together.';
  const scan=Q.scanWholeAnswerLanguage(original,niece,V);
  assert.equal(scan.correctionScope,'complete_sentence');
  assert.equal(scan.correctionOriginal,'My sibling take care of her.');
  assert.equal(scan.correctionBetter,'My sibling takes care of her.');
  const issues=Q.finalChallengeLanguageIssues(original,[niece,{kind:'vocabulary',target:'sibling'}],V);
  assert(issues.some(x=>x.category==='third_person_singular'));
});

test('12 — Final quantity and Target evidence remain based on the original full answer',()=>{
  const items=[{kind:'vocabulary',target:'niece',coverageId:'n'},{kind:'vocabulary',target:'sibling',coverageId:'s'}];
  const f={learnerUtterance:'My niece is five years old. My sibling take care of her. They live together.',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,independentProduction:true,coachSuppliedAnswer:false,correction:'retried',retryUtterance:'My sibling takes care of her.',retryUtteranceReliability:'confirmed',retryTranscriptionIssue:false,retryLearnerFinished:true};
  const result=Q.finalChallengeRequirements(f,items);
  assert.equal(result.sentenceCount,3);
  assert.equal(result.targetCount,2);
  assert.equal(result.passed,true);
});

test('prompt and report contract publish V2.31.3 gates and issue taxonomy',()=>{
  for(const phrase of ['SCAN COMPLETE ANSWER','CORRECTION UNIT = COMPLETE SENTENCE','RETRY SCOPE = CORRECTION SCOPE','turnCompletionReliable','completeAnswerScanned','selfCorrectionDetected',"correctionScope:'none|complete_sentence|multiple_complete_sentences'","retryScope:'none|complete_sentence|multiple_complete_sentences'",'correction_started_before_answer_complete','complete_answer_not_scanned','fragment_only_correction','later_sentence_error_missed','unnecessary_full_answer_retry','correction_scope_mismatch']) assert(client.includes(phrase),phrase);
  assert(live.split(/\s+/).length<1200,`Live prompt too long: ${live.split(/\s+/).length}`);
});
