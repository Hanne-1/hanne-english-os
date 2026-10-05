const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createApp,tick}=require('./ui.cjs');

// Offline contract fixtures. These check what the generated Brief tells the Coach
// and how its target ledger should advance; they do not invoke ChatGPT Voice.
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/coach-scenarios.json'),'utf8'));

async function briefFor({targets,grammar=[]}){
 const app=createApp();await tick();
 const lesson={id:'coach_fixture',title:'Coach fixture',curriculum:{mainVocabulary:targets.map(term=>({term,meaning:'fixture'})),extendedVocabulary:[],grammar:grammar.map(rule=>({rule})),conversationReference:[]}};
 app.localStorage.setItem('english_os_lessons',JSON.stringify([lesson]));
 return app.json('buildSpeakingV2Brief("coach_fixture")');
}
function nextEligible(brief,current,practiced=[]){
 const eligible=brief.targetPlan.eligibleTargets;
 const currentIndex=eligible.findIndex(x=>x.target===current);
 return [...eligible.slice(currentIndex+1),...eligible.slice(0,currentIndex+1)].find(x=>!practiced.includes(x.target))||null;
}
function formatRealError(template,fixture){
 return template.replace('{learner exact sentence}',fixture.learner)
  .replace('{minimal correction preserving meaning}',fixture.minimalCorrection)
  .replace('{brief explanation}',fixture.explanation);
}
function resolveTargets(plan,targets){
 const resolved=new Set(targets);
 const practicedTargets=plan.eligibleTargets.filter(target=>resolved.has(target.target));
 const remainingTargets=plan.remainingTargets.filter(target=>!resolved.has(target.target));
 return {practicedTargets,remainingTargets,requiredRemainingTargets:remainingTargets.filter(target=>target.required===true)};
}
function formatCorrectionExplanation(template,fixture){
 return template.replace('{learner original}',fixture.original)
  .replace('{actual correction}',fixture.corrected)
  .replace('{only actual changed words}',fixture.difference)
  .replace('{brief explanation of only that difference}','is describes the current state; will be describes a future result.');
}

for(const fixture of fixtures){
 test(`Coach contract ${fixture.id}`,async()=>{
  const brief=await briefFor(fixture),rules=brief.coachInstructions,plan=brief.targetPlan;
  assert.equal(rules.roleAllocation.coachLeadsExerciseAndSelectsTargets,true);
  assert.equal(rules.roleAllocation.learnerProducesEnglish,true);
  assert.equal(rules.targetSelection.onlyUseTargetPlan,true);
  assert.equal(rules.targetSelection.onlyCurrentLessonTargets,true);
  assert(!Object.hasOwn(brief,'reviewItems'));
  assert(!Object.hasOwn(brief,'previousWeaknesses'));
  switch(fixture.id){
   case 'start':{
    assert.equal(rules.sessionStart.startImmediately,true);
    assert.equal(rules.sessionStart.askLearnerWhatToPractice,false);
    assert.equal(rules.sessionStart.provideModelSentenceBeforeAttempt,false);
    assert.equal(plan.currentTarget.target,fixture.expectedTarget);
    const prompt=rules.sessionStart.vocabularyPromptTemplate.replaceAll('{target}',plan.currentTarget.target);
    assert.equal(prompt,fixture.expectedPrompt);
    break;
   }
   case 'next':{
    assert(rules.progression.readySignals.includes('Next'));
    assert.equal(rules.progression.onReadySignal,'prompt_next_eligible_target_only_when_question_mode_inactive');
    assert.equal(rules.progression.neverAskLearnerForNextWord,true);
    assert.equal(nextEligible(brief,fixture.currentTarget)?.target,fixture.expectedTarget);
    assert.equal(rules.progression.unresolvedTargetRemainsInRemainingTargets,true);
    assert.equal(rules.ledgerRules.onReadyBeforeResolution,'advance_but_keep_prior_target_remaining');
    assert(plan.remainingTargets.some(x=>x.target===fixture.currentTarget));
    break;
   }
   case 'out_of_brief':{
    assert(!plan.eligibleTargets.some(x=>x.target===fixture.excludedTarget));
    assert.equal(rules.progression.neverInventOutOfBriefTarget,true);
    assert.equal(rules.sessionFlowRules.finalChallengeIsAStageNotANewTarget,true);
    assert.equal(rules.sessionFlowRules.doNotCreateChallengeTargetUnlessPresentInTargetPlan,true);
    break;
   }
   case 'incomplete_speech':{
    assert(rules.turnCompletion.incompleteSignals.includes('um'));
    assert(rules.turnCompletion.incompleteSignals.includes('fragmented_speech'));
    assert.equal(rules.turnCompletion.allowedEncouragement,fixture.expectedPrompt);
    assert.equal(rules.turnCompletion.doNotTakeOverOrCorrectDuringFormulation,true);
    assert.equal(rules.evidence.fragmentNeverCounts,true);
    assert.equal(rules.ledgerRules.onIncompleteOrUnclearSpeech,'keep_current_target_unresolved');
    break;
   }
   case 'unclear_transcript':{
    assert.equal(rules.hearingReliability.repeatPrompt,fixture.expectedPrompt);
    assert.equal(rules.hearingReliability.neverReconstructSpeechFromContext,true);
    assert.equal(rules.hearingReliability.unreliableSpeechIsNotProductionEvidence,true);
    assert.equal(rules.ledgerRules.onIncompleteOrUnclearSpeech,'keep_current_target_unresolved');
    assert.equal(rules.correction.onlyAfterCompleteThoughtAndReliableHearing,true);
    break;
   }
   case 'correct_sentence':{
    assert.equal(rules.correction.correctAndNatural,fixture.expectedPrompt);
    assert.equal(rules.correction.neverInventErrorToProvideFeedback,true);
    assert.equal(rules.correction.correctButMoreNatural.correctionNeeded,false);
    assert(!fixture.expectedPrompt.includes('Better:'));
    break;
   }
   case 'real_grammar_error':{
    assert.equal(formatRealError(rules.correction.realErrorFormat,fixture),fixture.expectedPrompt);
    assert.equal(rules.correction.preserveLearnerOriginal,true);
    assert.equal(rules.retry.preserveLearnerMeaning,true);
    assert.equal(rules.retry.doNotReplaceWithDifferentCoachAnswer,true);
    assert.equal(rules.ledgerRules.markPracticedOnlyAfter,'reliable_independent_completed_target_production');
    break;
   }
   case 'question_interruption':{
    assert.equal(rules.questionHandling.answerQuestionImmediately,true);
    assert.equal(rules.questionHandling.preserveCurrentTargetAndRemainingTargets,true);
    assert.equal(rules.questionHandling.resumeSpeakingAfterExplanation,true);
    assert.equal(rules.ledgerRules.onLearnerQuestion,'preserve_current_and_remaining_targets');
    assert.equal(rules.questionHandling.resumePosition,'same_target_if_unresolved_otherwise_next_required');
    assert.equal(rules.questionHandling.questionMode.afterAnswer,'wait_for_learner_response');
    assert.equal(nextEligible(brief,fixture.currentTarget,fixture.practicedTargets)?.target,fixture.expectedNextTarget);
    break;
   }
   case 'no_coach_created_evidence':{
    const prompt=rules.turnCompletion.fragmentPromptTemplate.replace('{target}',fixture.currentTarget);
    assert.equal(prompt,fixture.expectedPrompt);
    assert(!prompt.includes(fixture.forbiddenCoachSentence));
    assert.equal(rules.evidence.targetUsageRequired,true);
    assert.equal(rules.evidence.coachModelSentenceNeverCounts,true);
    assert.equal(rules.evidence.fragmentNeverCounts,true);
    break;
   }
   case 'end_of_list':{
    assert.equal(nextEligible(brief,fixture.currentTarget,fixture.practicedTargets)?.target,fixture.expectedNextTarget);
    assert.equal(rules.completion.ifPracticeContinues,'coach_prompts_next_eligible_target');
    assert.equal(rules.completion.neverUsePassiveContinueInvitationDuringActivePractice,true);
    break;
   }
   case 'vocabulary_to_optional_grammar':{
    const ledger=resolveTargets(plan,fixture.resolvedVocabulary);
    assert.equal(ledger.practicedTargets.length,fixture.resolvedVocabulary.length);
    assert.equal(ledger.remainingTargets[0]?.target,fixture.expectedNextTargetIfContinuing);
    assert.equal(ledger.remainingTargets[0]?.component,'Grammar / Know-how');
    assert.equal(ledger.remainingTargets[0]?.required,false);
    assert.equal(rules.completion.grammarTargetsOptionalForSessionEnding,true);
    assert.equal(rules.completion.remainingGrammarDoesNotBlockNaturalEnding,true);
    assert(rules.ledgerRules.onResolvedTarget.includes('recompute_remainingTargets'));
    assert(rules.ledgerRules.onResolvedTarget.includes('prompt_it_if_session_continues'));
    assert.equal(ledger.requiredRemainingTargets.length,0);
    break;
   }
   case 'preserve_valid_lexical_choice':{
    assert.equal(rules.correction.correctAndNatural,fixture.expectedPrompt);
    assert.equal(rules.correction.meaningLock.preserveGrammaticallyValidSemanticallyPossibleUnderstandableWords,true);
    assert.equal(rules.correction.meaningLock.doNotReplaceValidLexicalChoiceForCoachPreference,true);
    assert.equal(rules.correction.meaningLock.noActualError,'say_correct_and_natural_without_Better');
    assert(fixture.learner.includes('salesman'));
    assert(!fixture.expectedPrompt.includes(fixture.forbiddenReplacement));
    assert(!fixture.expectedPrompt.includes('Better:'));
    break;
   }
   case 'minimal_meaning_locked_correction':{
    assert.equal(rules.correction.meaningLock.beforeBetter,'compare_original_and_corrected_tokens_and_meaning');
    assert.equal(rules.correction.meaningLock.everyChangedContentWordNeedsReason,true);
    assert.equal(rules.correction.meaningLock.preserveLearnerRelationshipsAndIntendedMeaning,true);
    const original=fixture.learner.slice(0,-1).split(' '),corrected=fixture.minimalCorrection.slice(0,-1).split(' ');
    assert.deepEqual(corrected.filter(token=>!original.includes(token)),[fixture.expectedAddedToken]);
    assert.deepEqual(original.filter(token=>!corrected.includes(token)),[]);
    assert(fixture.minimalCorrection.includes(fixture.preservedContentWord));
    assert(!fixture.minimalCorrection.includes(fixture.forbiddenReplacement));
    assert(formatRealError(rules.correction.realErrorFormat,fixture).includes(`Better:\n${fixture.minimalCorrection}`));
    break;
   }
   case 'clarification_blocks_progression':{
    const mode=rules.questionHandling.questionMode;
    const ledgerBefore=JSON.stringify(plan);
    assert.equal(mode.enterOnClarificationAboutCorrection,true);
    assert.equal(mode.priorityOverReadySignalsAndProgression,true);
    assert.equal(mode.answerExactQuestionFirst,true);
    assert.equal(mode.doNotAdvanceTargetWhileActive,true);
    assert.equal(mode.doNotPromptNextWordWhileActive,true);
    assert.equal(mode.doNotTreatYesOrOkayAsProgressionBeforeAnswer,true);
    const explanation=formatCorrectionExplanation(mode.correctionExplanationFormat,fixture);
    assert(explanation.includes(`Original:\n${fixture.original}`));
    assert(explanation.includes(`Corrected:\n${fixture.corrected}`));
    assert(explanation.includes(`Difference:\n${fixture.difference}`));
    assert(!explanation.includes(fixture.forbiddenNextTarget));
    assert.equal(JSON.stringify(plan),ledgerBefore);
    break;
   }
   case 'clarification_follow_up':{
    const mode=rules.questionHandling.questionMode;
    const preservedLedger=JSON.stringify(plan);
    assert.equal(mode.answerFollowUpQuestionsBeforeResuming,true);
    assert.equal(mode.afterAnswer,'wait_for_learner_response');
    assert(mode.acknowledgments.includes(fixture.acknowledgment));
    assert.equal(mode.onAcknowledgmentAfterAnswer,'exit_question_mode_then_resume_from_preserved_target_ledger');
    assert(fixture.expectedCurrentExplanation.includes('current state'));
    assert(fixture.expectedFutureExplanation.includes('future state'));
    assert.equal(JSON.stringify(plan),preservedLedger);
    assert.equal(nextEligible(brief,'spouse',['spouse'])?.target,fixture.expectedNextTarget);
    break;
   }
   case 'optional_grammar_natural_ending':{
    const afterVocabulary=resolveTargets(plan,fixture.resolvedVocabulary);
    assert.equal(rules.completion.grammarTargetsOptionalForSessionEnding,true);
    assert.equal(rules.completion.normalEnding,'allowed_after_a_coherent_lesson_practice_and_no_unresolved_learner_turn');
    assert.equal(afterVocabulary.remainingTargets.length,fixture.resolvedGrammar.length);
    assert.equal(afterVocabulary.requiredRemainingTargets.length,0);
    assert(afterVocabulary.remainingTargets.every(target=>target.required===false));
    const afterGrammar=resolveTargets(plan,[...fixture.resolvedVocabulary,...fixture.resolvedGrammar]);
    assert.equal(afterGrammar.remainingTargets.length,0);
    assert.equal(rules.completion.ifEnding,'close_naturally_without_passive_invitation');
    break;
   }
   default:throw new Error(`Unknown fixture: ${fixture.id}`);
  }
 });
}
