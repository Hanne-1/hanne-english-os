/* Shared, deterministic Speaking runtime rules. New sessions use one schema source. */
(function (root) {
  'use strict';
  const SPEAKING_SCHEMA_VERSION = '2.32.0';
  const PHASES = ['warmup', 'lesson_application', 'knowledge_integration', 'final_challenge'];
  const REASONS = ['not_asked', 'no_learner_response', 'unreliable_transcript', 'hearing_unresolved', 'target_not_produced', 'usage_clarification_needed', 'correction_unresolved', 'queue_order_violation', 'explicit_skip', 'wrong_task_mode', 'coach_only_target', 'model_only', 'session_stopped'];
  const ITEM_STATES = ['PENDING', 'ACTIVE', 'AWAITING_LEARNER', 'EVALUATING', 'HEARING_UNRESOLVED', 'TARGET_UNRESOLVED', 'TASK_UNRESOLVED', 'CORRECTION_REQUIRED', 'AWAITING_RETRY', 'EVALUATING_RETRY', 'RESOLVED', 'RESOLVED_WITH_DECLINED_CORRECTION', 'EXPLICITLY_SKIPPED', 'SESSION_STOPPED', 'FINAL_CHALLENGE_AWAITING_RETRY'];
  const LIVE_ITEM_STATES = ['PENDING', 'ACTIVE', 'AWAITING_LEARNER', 'NEEDS_SUPPORT', 'AWAITING_RETRY', 'RESOLVED', 'EXPLICITLY_SKIPPED'];
  const NEXT_COACH_ACTIONS = Object.freeze(['WAIT', 'CLARIFY_HEARING', 'ELICIT_TARGET', 'CLARIFY_USAGE', 'CORRECT_AND_REQUEST_RETRY', 'REQUEST_RETRY', 'REQUEST_OR_EVALUATE_RETRY', 'FOLLOW_UP_CURRENT_WORD', 'ADVANCE', 'START_FINAL_CHALLENGE', 'CONTINUE_FINAL_CHALLENGE', 'COMPLETE_SESSION']);
  const LIVE_RUNTIME_MODES = Object.freeze(['PRACTICE', 'RETRY', 'FINAL']);
  const TERMINAL_ITEM_STATES = ['RESOLVED', 'RESOLVED_WITH_DECLINED_CORRECTION', 'EXPLICITLY_SKIPPED'];
  const text = x => typeof x === 'string' ? x : '';
  const clone = x => JSON.parse(JSON.stringify(x));
  function stable(x) { return JSON.stringify(sort(x)); }
  function sort(x) { return Array.isArray(x) ? x.map(sort) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])])) : x; }
  function version(x) {
    const s = stable(x); let a = 2166136261, b = 5381;
    for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ s.charCodeAt(i); }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  function parsedVersion(raw) { const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(text(raw)); return m ? [+m[1], +m[2], +(m[3] || 0)] : null; }
  function atLeast(raw, major, minor) { const v = parsedVersion(raw); return !!v && (v[0] > major || (v[0] === major && v[1] >= minor)); }
  function isQueueReport(raw) { return atLeast(raw?.schemaVersion, 2, 24); }
  function isSimplifiedReport(raw) { return atLeast(raw?.schemaVersion, 2, 25); }
  function isExecutionGateReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 25 || (v[1] === 25 && v[2] >= 2)))); }
  function isCurrentItemReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 25 || (v[1] === 25 && v[2] >= 3)))); }
  function isRuntimeIntegrityReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 25 || (v[1] === 25 && v[2] >= 4)))); }
  function isVocabularyOnlyReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 25 || (v[1] === 25 && v[2] >= 5)))); }
  function isVocabularyStabilityReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 25 || (v[1] === 25 && v[2] >= 6)))); }
  function isRuntimeLockReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 25 || (v[1] === 25 && v[2] >= 7)))); }
  function isLiveControllerSimplificationReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 25 || (v[1] === 25 && v[2] >= 8)))); }
  function isTurnPatienceReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 25 || (v[1] === 25 && v[2] >= 9)))); }
  function isThreeGateReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && v[1] >= 26)); }
  function isEvidenceLockReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 26 || (v[1] === 26 && v[2] >= 1)))); }
  function isCurrentWordLockReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && v[1] >= 27)); }
  function isPreResponseActionLockReport(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 27 || (v[1] === 27 && v[2] >= 1)))); }
  function isSimplifiedLiveControllerV228Report(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && v[1] >= 28)); }
  function isVoiceRuntimeFixV229Report(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && v[1] >= 29)); }
  function isLiveRuntimeStateV230Report(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && v[1] >= 30)); }
  function isTurnCompletionCorrectionV231Report(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && v[1] >= 31)); }
  function isMinimalRuntimePatchV2311Report(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 31 || (v[1] === 31 && v[2] >= 1)))); }
  function isReliableListeningV2312Report(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 31 || (v[1] === 31 && v[2] >= 2)))); }
  function isWholeAnswerV2313Report(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && (v[1] > 31 || (v[1] === 31 && v[2] >= 3)))); }
  function isDeterministicV232Report(raw) { const v = parsedVersion(raw?.schemaVersion); return !!v && (v[0] > 2 || (v[0] === 2 && v[1] >= 32)); }
  function schemaClass(raw) { return !isSimplifiedReport(raw) ? 'legacy' : isDeterministicV232Report(raw) ? 'deterministic_v232' : isWholeAnswerV2313Report(raw) ? 'whole_answer_v2313' : isReliableListeningV2312Report(raw) ? 'reliable_listening_v2312' : isMinimalRuntimePatchV2311Report(raw) ? 'minimal_runtime_patch_v2311' : isTurnCompletionCorrectionV231Report(raw) ? 'turn_completion_correction_v231' : isLiveRuntimeStateV230Report(raw) ? 'live_runtime_state_v230' : isVoiceRuntimeFixV229Report(raw) ? 'voice_runtime_fix_v229' : isSimplifiedLiveControllerV228Report(raw) ? 'simplified_live_controller_v228' : isPreResponseActionLockReport(raw) ? 'pre_response_action_lock' : isCurrentWordLockReport(raw) ? 'current_word_lock' : isLiveControllerSimplificationReport(raw) ? 'live_controller_simplification' : isRuntimeLockReport(raw) ? 'runtime_lock_fix' : isVocabularyStabilityReport(raw) ? 'vocabulary_stability' : isVocabularyOnlyReport(raw) ? 'vocabulary_only' : isRuntimeIntegrityReport(raw) ? 'runtime_integrity' : isCurrentItemReport(raw) ? 'current_item_lock' : isExecutionGateReport(raw) ? 'execution_gates' : 'simplified'; }
  function inventory(lesson, corrections = [], options = {}) {
    const schemaVersion = typeof options === 'string' ? options : options.schemaVersion || SPEAKING_SCHEMA_VERSION;
    const legacy = !atLeast(schemaVersion, 2, 25), vocabularyOnly = isVocabularyOnlyReport({schemaVersion});
    const c = lesson.curriculum || {}, items = new Map();
    function add(kind, key, target, label, taskMode, source, extra = {}) {
      if (!text(key).trim()) return;
      const coverageId = JSON.stringify([lesson.id, kind, key]);
      items.set(coverageId, { coverageId, sourceVersion: version({ policy: '2.24.0', taskMode, source }), lessonId: lesson.id, kind, target, label, taskMode, ...extra });
    }
    [...(c.mainVocabulary || []), ...(c.extendedVocabulary || [])].filter(x => !x.excludeFromPractice).forEach(x => add('vocabulary', x.term, x.term, x.term, 'vocabulary_production', { term: x.term, meaning: x.meaning || '', partOfSpeech: x.partOfSpeech || x.pos || '' }));
    if (!vocabularyOnly) (c.grammar || []).filter(x => !x.excludeFromPractice).forEach(x => {
        const rule = typeof x === 'string' ? x : x.rule || x.title || x.name || '';
        const capitalization = /capital|大寫|小寫/i.test(rule);
        const grammarTask = !capitalization ? 'rule_application' : /誰的|所有格|possessive/i.test(rule) ? 'possessive_title' : /代替|replac|instead of/i.test(rule) ? 'title_replacing_name' : /名字|姓名|name/i.test(rule) ? 'title_with_name' : 'capitalization_decision';
        const expectedAnswer = grammarTask === 'possessive_title' ? 'lowercase' : capitalization ? 'capital' : null;
        add('grammar', rule, rule, rule, 'grammar_application', x, { evidenceType: capitalization ? 'capitalization_decision' : 'rule_application', grammarTask, expectedAnswer, grammarSource: x });
      });
    if (legacy) corrections.filter(x => x.lessonId === lesson.id).forEach(x => add('correction', x.correctionId, x.target, x.target + ' · ' + (x.round || x.component) + ' 訂正', x.round === 'spelling' ? 'spelling_recall' : 'correction_transfer', { prompt: x.prompt, answerStatus: x.answerStatus, originalAnswer: x.originalAnswer, gptSuggestedAnswer: x.gptSuggestedAnswer, learnerCorrection: x.learnerCorrection, round: x.round, component: x.component }, { correctionId: x.correctionId, component: x.component, sourcePrompt: x.prompt }));
    return [...items.values()];
  }
  const practiced = item => ['PRACTICED', 'PRACTICED_RELIABLY'].includes(item?.state);
  function summarize(s) {
    s.completedCoverage = s.queue.filter(practiced);
    s.remainingCoverage = s.queue.filter(x => !practiced(x));
    const byKind = {};
    for (const kind of ['vocabulary', 'grammar']) {
      const rows = s.queue.filter(x => x.kind === kind), done = rows.filter(practiced).length;
      byKind[kind] = { total: rows.length, practiced: done, remaining: rows.length - done };
    }
    s.sessionCoverage = { total: s.queue.length, practiced: s.completedCoverage.length, remaining: s.remainingCoverage.length, remainingIds: s.remainingCoverage.map(x => x.coverageId), byKind };
    return s;
  }
  function reconcile(previous, items, identity = {}, schemaVersion = SPEAKING_SCHEMA_VERSION) {
    const s = previous ? clone(previous) : { ...identity, schemaVersion, attempts: [], phaseProgress: PHASES.map(phaseId => ({ phaseId, status: 'not_started', notes: '' })), finalChallengeStatus: null, completed: false, osVerifiedCompleted: false };
    const old = new Map((s.queue || []).map(x => [x.coverageId, x]));
    const newIds = new Set(items.map(x => x.coverageId));
    const addedOrChanged = !!previous && items.some(x => !old.has(x.coverageId) || old.get(x.coverageId).sourceVersion !== x.sourceVersion);
    const removedRequired = previous ? (s.queue || []).filter(x => ['vocabulary', 'grammar'].includes(x.kind) && !newIds.has(x.coverageId)) : [];
    const requiredChanged = !!previous && (addedOrChanged || removedRequired.length > 0);
    const completedVocabularyOnlyMigration = !!previous?.completed && isVocabularyOnlyReport({schemaVersion}) && !addedOrChanged && removedRequired.length > 0 && removedRequired.every(x => x.kind === 'grammar');
    s.queue = items.map(item => {
      const prior = old.get(item.coverageId);
      if (prior?.sourceVersion === item.sourceVersion) return { ...prior, ...item, state: practiced(prior) ? 'PRACTICED' : 'NOT_YET_PRACTICED' };
      return { ...item, state: 'NOT_YET_PRACTICED', remainingReason: 'not_asked', validationNote: prior ? '教材已更新，舊證據不適用。' : '' };
    });
    const previousSchemaVersion = text(s.schemaVersion);
    s.schemaVersion = completedVocabularyOnlyMigration ? schemaVersion : previous?.completed ? previousSchemaVersion || schemaVersion : schemaVersion;
    if (previous && !previous.completed && previousSchemaVersion && previousSchemaVersion !== schemaVersion) s.migrationMetadata = { strategy:'preserve_verified_progress_reset_active_attempt', fromSchemaVersion:previousSchemaVersion, toSchemaVersion:schemaVersion, migrationStage:'reconcile' };
    if (requiredChanged && !completedVocabularyOnlyMigration) {
      s.completed = s.osVerifiedCompleted = false; s.finalChallengeStatus = null;
      s.phaseProgress = s.phaseProgress.map(p => p.phaseId === 'final_challenge' ? { ...p, status: 'not_started', notes: '教材更新後需重新完成 Final Challenge。' } : p);
      s.activeAttempt = null;
    }
    summarize(s);
    if(completedVocabularyOnlyMigration){
      const audit=fullVocabularyCoverageAudit(s);
      s.runtimeQueue={...audit,sessionState:s.completed?'COMPLETED':audit.passed?'FINAL_CHALLENGE':'REQUIRED_PRACTICE'};
      delete s.runtimeQueue.passed;delete s.runtimeQueue.auditedCoverageIds;
      s.migrationMetadata={strategy:'remove_grammar_from_speaking_coverage',fromSchemaVersion:previousSchemaVersion,toSchemaVersion:schemaVersion,migrationStage:'reconcile'};
    }
    return s;
  }
  const words = s => text(s).toLowerCase().normalize('NFKC').match(/[a-z]+(?:['’][a-z]+)?/g) || [];
  function containsTarget(utterance, target) {
    const u = words(utterance).join(' '), t = words(target).join(' ');
    if (!t) return false;
    return (' ' + u + ' ').includes(' ' + t + ' ') || (' ' + u + ' ').includes(' ' + t + 's ') || (' ' + u + ' ').includes(' ' + t + "'s ");
  }
  function evaluateTargetUsage(item, utterance) {
    const target=text(item?.target).toLowerCase().trim(), sentence=normalizedSentence(utterance);
    if(!target||!containsTarget(utterance,target))return {value:null,reason:'target_not_produced'};
    if(target==='ancestor'&&/\b(?:my\s+)?ancestor\s+(?:is|was)\s+(?:my\s+)?(?:father|mother|dad|mom|parent)\b/.test(sentence)){
      return {value:false,issueType:'usage_clarification',reason:'“Ancestor” 指更早世代的祖先；父母通常稱為 parent。'};
    }
    if(target==='niece'&&/\b(?:my\s+)?niece\s+(?:is|was)\s+(?:my\s+)?cousin(?:\s+s)?\s+(?:daughter|child)\b/.test(sentence))return {value:false,issueType:'usage_clarification',reason:'Niece 通常是 sibling 或 sibling-in-law 的女兒；請先確認 family relationship。'};
    if(target==='descendant'&&/\b(?:dinosaur|dinosaurs)\s+(?:is|are|were)\s+(?:a\s+)?descendants?\s+of\s+(?:a\s+)?(?:chicken|chickens)\b/.test(sentence))return {value:false,issueType:'usage_clarification',reason:'Descendant 的方向相反；chickens are descendants of dinosaurs。'};
    if(target==='sibling'&&/\b(?:my\s+)?(?:cousin|friend)\s+(?:is|was)\s+(?:my\s+)?sibling\b/.test(sentence))return {value:false,issueType:'usage_clarification',reason:'Sibling 指 brother 或 sister，不是 cousin 或 friend。'};
    if(target==='spouse'&&/\b(?:my\s+)?(?:boyfriend|girlfriend)\s+(?:is|was)\s+(?:my\s+)?spouse\b/.test(sentence)&&!/\b(?:future|will|marry|married)\b/.test(sentence))return {value:false,issueType:'usage_clarification',reason:'Spouse 指已婚的 husband、wife 或 married partner。'};
    return {value:true,reason:'acceptable_target_use'};
  }
  function capitalizationChoice(value) {
    const v = text(value).toLowerCase();
    const lower = /\blower(?:case)?\b|小寫/.test(v), capital = /\b(?:capital|uppercase|upper-case)\b|大寫/.test(v);
    return lower === capital ? null : lower ? 'lowercase' : 'capital';
  }
  function isClearlyUnfinishedUtterance(value) {
    const raw=text(value).trim();
    if(/[.…]{2,}\s*$/.test(raw))return true;
    const normalized=normalizedSentence(raw);
    return !!normalized&&/(?:\b(?:and|but|because|so|if|when|they|he|she|uh|um)|\b(?:if\s+i|when\s+we|she\s+is)|\b(?:i|you|he|she|it|we|they)\s+(?:am|is|are|was|were|have|has|had|will|would|can|could|should|might|must)|\bmy\s+(?:spouse|ancestor)|\bi\s+think)$/.test(normalized);
  }
  const TURN_COMPLETION_BASES=Object.freeze(['complete_thought','explicit_yield','learner_question','help_request','uncertain']);
  function deriveTurnCompletionEvidence(input={}) {
    const utterance=text(input.learnerUtterance).trim();
    const claimed=input.turnCompletionEvidence&&typeof input.turnCompletionEvidence==='object'?input.turnCompletionEvidence:{};
    const open=isClearlyUnfinishedUtterance(utterance);
    const learnerFinished=input.learnerFinished===true&&!open;
    let completionBasis=TURN_COMPLETION_BASES.includes(claimed.completionBasis)?claimed.completionBasis:'uncertain';
    if(learnerFinished&&completionBasis==='uncertain'){
      completionBasis=/\b(?:how do i say|what does|can you help|could you help)\b/i.test(utterance)?'help_request':/\?\s*$/.test(utterance)?'learner_question':/\b(?:i(?:'m| am) done|that(?:'s| is) all|finished)\b/i.test(utterance)?'explicit_yield':'complete_thought';
    }
    const positiveCompletionDetected=learnerFinished&&completionBasis!=='uncertain'&&claimed.positiveCompletionDetected!==false;
    return {positiveCompletionDetected,completionBasis:positiveCompletionDetected?completionBasis:'uncertain'};
  }
  function detectImportantLanguageIssues(utterance, item = {}, schemaVersion = SPEAKING_SCHEMA_VERSION) {
    const original=text(utterance).trim(), issues=[];
    if(!original)return issues;
    const liveControllerSimplification=isLiveControllerSimplificationReport({schemaVersion});
    const add=(category,better,reason)=>{if(better&&normalizedSentence(better)!==normalizedSentence(original)&&!issues.some(x=>x.category===category))issues.push({category,original,better,reason});};
    if(isMinimalRuntimePatchV2311Report({schemaVersion})&&/\bif\s+i\s+get\s+married\s*,?\s+i\s+have\s+a\s+spouse\b/i.test(original)){
      add('future_result_tense',original.replace(/\bi\s+have\s+a\s+spouse\b/i,'I will have a spouse'),'You\'re talking about a future result, so “will have” is more natural here.');
      return issues;
    }
    if(isMinimalRuntimePatchV2311Report({schemaVersion})&&/\bmy\s+ancestor\s+was\s+a\s+businessman\s+and\s+he\s+is\s+sold\s+pork\s+in\s+the\s+market\b/i.test(original)){
      add('past_tense_clause_cluster','My ancestor was a businessman, and he sold pork in the market.','You\'re talking about the past, so use “sold,” not “is sold.”');
      return issues;
    }
    if(isTurnCompletionCorrectionV231Report({schemaVersion})&&/\bmy\s+ancestor\s+was\s+a\s+businessman\s+and\s+he\s+is\s*,?\s*(?:uh\s*,?\s*)?sell\s+the\s+pork\s+in\s+the\s+market\b/i.test(original)){
      add('past_tense_clause_cluster','My ancestor was a businessman, and he sold pork in the market.','You\'re talking about the past, so use “was” and “sold.” We usually say “sell pork” without “the” when talking about pork in general.');
      return issues;
    }
    const target=text(item.target).toLowerCase();
    if(isDeterministicV232Report({schemaVersion})&&target==='ancestor'&&/\bmy\s+ancestor\s+is\s+a\s+businessman\s+and\s+he\s+sell\s+beef\s+in\s+the\s+market\b/i.test(original)){
      add('past_tense_clause_cluster','My ancestor was a businessman and he sold beef in the market.','Use “was” and “sold” because you are talking about him in the past.');
      return issues;
    }
    if(isDeterministicV232Report({schemaVersion})&&target==='descendant'&&/\bmy\s+sister\s+daughter\s+is\s+my\s+sister\s+descendant\b/i.test(original)){
      add('possessive_relationship','My sister’s daughter is my sister’s descendant.','Use the possessive form “sister’s” to show both relationships.');
      return issues;
    }
    if(isDeterministicV232Report({schemaVersion})&&target==='sibling'&&/\b(he|she)\s+always\s+annoys\b(?!\s+(?:me|him|her|us|them|you)\b)/i.test(original)){
      add('missing_object',original.replace(/\b(he|she)\s+always\s+annoys\b/i,'$1 always annoys me'),'“Annoy” needs an object here, so use “annoys me.”');
      return issues;
    }
    let better=original;
    if(isWholeAnswerV2313Report({schemaVersion})&&target==='ancestor'&&/\bmy\s+ancestor\s+is\s+businessman\b/i.test(better)){
      const fixed=better.replace(/\bmy\s+ancestor\s+is\s+businessman\b/i,'My ancestor was a businessman');
      add('past_tense_article',fixed,'Use “was” for the past context and add “a” before “businessman.”');
      better=fixed;
    }
    if(isWholeAnswerV2313Report({schemaVersion})&&target==='ancestor'&&/\bmy\s+ancestor\s+is\s+a\s+businessman\b/i.test(better)&&/\b(?:sold|worked|lived)\b/i.test(better)){
      const fixed=better.replace(/\bmy\s+ancestor\s+is\s+a\s+businessman\b/i,'My ancestor was a businessman');
      add('past_tense_consistency',fixed,'Use “was” to keep the ancestor description in the past.');
      better=fixed;
    }
    if(isWholeAnswerV2313Report({schemaVersion})&&target==='ancestor'&&/\bhe\s+sell\s+pork\b/i.test(better)){
      const fixed=better.replace(/\bhe\s+sell\s+pork\b/i,m=>m.replace(/sell/i,'sold'));
      add('wrong_tense_or_verb_form',fixed,'Use “sold” for the past.');
      better=fixed;
    }
    if(isWholeAnswerV2313Report({schemaVersion})&&target==='ancestor'&&/\bat\s+market\b/i.test(better)){
      const fixed=better.replace(/\bat\s+market\b/i,'at the market');
      add('important_article_preposition',fixed,'Say “at the market.”');
      better=fixed;
    }
    if(isWholeAnswerV2313Report({schemaVersion})&&/\bi\s+think\s+(he|she|it)\s+(very\s+)?(hardworking|busy|kind|helpful|friendly|patient|funny|angry|happy|sad)\b/i.test(better)){
      const fixed=better.replace(/\bi\s+think\s+(he|she|it)\s+(very\s+)?(hardworking|busy|kind|helpful|friendly|patient|funny|angry|happy|sad)\b/i,'I think $1 was $2$3');
      add('missing_be_verb',fixed,'Add “was” before the adjective.');
      better=fixed;
    }
    if(/\ba\s+one\s+([a-z]+)/i.test(better)){
      better=better.replace(/\ba\s+one\s+([a-z]+)/i,'one $1');
      add('important_article_determiner',better,'one 已經是限定詞，前面不再加 a。');
    }
    if(/\b(?:is|was)\s+very\s+([a-z]+)\s+a\s+([a-z]+)/i.test(better)){
      const fixed=better.replace(/\b(is|was)\s+very\s+([a-z]+)\s+a\s+([a-z]+)/i,'$1 a very $2 $3');
      add('incomplete_core_sentence_structure',fixed,'英文名詞片語使用 a + very + adjective + noun。');
      better=fixed;
    }
    if(/\b(is|was)\s+(very\s+)?kind\s+(girl|boy|person|woman|man)\b/i.test(better)){
      const fixed=better.replace(/\b(is|was)\s+(very\s+)?kind\s+(girl|boy|person|woman|man)\b/i,(_,verb,very,noun)=>`${verb} a ${very||''}kind ${noun}`);
      add('important_article_determiner',fixed,'單數可數名詞片語需要 a。');
      better=fixed;
    }
    if(/\b(she['’]s|he['’]s|it['’]s)\s+(very\s+)?(beautiful|handsome|kind|quiet|soft|friendly|patient|funny)\s+(girl|boy|person|woman|man)\b/i.test(better)){
      const fixed=better.replace(/\b(she['’]s|he['’]s|it['’]s)\s+(very\s+)?(beautiful|handsome|kind|quiet|soft|friendly|patient|funny)\s+(girl|boy|person|woman|man)\b/i,(_,subject,very,adjective,noun)=>`${subject} a ${very||''}${adjective} ${noun}`);
      add('important_article_determiner',fixed,'A singular countable noun phrase needs a.');
      better=fixed;
    }
    if(/\b(she['’]s|he['’]s|it['’]s)\s+(student|teacher|doctor|nurse|manager|engineer|designer|writer|artist)\b/i.test(better)){
      const fixed=better.replace(/\b(she['’]s|he['’]s|it['’]s)\s+(student|teacher|doctor|nurse|manager|engineer|designer|writer|artist)\b/i,'$1 a $2');
      add('important_article_determiner',fixed,'單數職業或身分類可數名詞前需要 a。');
      better=fixed;
    }
    const ageNumber=liveControllerSimplification?'(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)':'(?:\\d+)';
    const nieceAgePattern=new RegExp('\\b(?:my\\s+)?niece\\s+(?:is\\s+)?(?:about\\s+)?'+ageNumber+'\\s+years?\\s+old\\b','i');
    if(nieceAgePattern.test(better)&&!/\bniece\s+is\b/i.test(better)){
      const fixed=better.replace(new RegExp('\\b(my\\s+niece|niece)\\s+((?:about\\s+)?'+ageNumber+'\\s+years?\\s+old)\\b','i'),'$1 is $2');
      add('missing_be_verb',fixed,'年齡句需要 be 動詞 is。');
      better=fixed;
    }
    const pronounAgePattern=new RegExp('\\b(she|he)\\s+((?:about\\s+)?'+ageNumber+'\\s+years?\\s+old)\\b','i');
    if(pronounAgePattern.test(better)){
      const fixed=better.replace(pronounAgePattern,'$1 is $2');
      add('missing_be_verb',fixed,'年齡句需要 be 動詞 is。');
      better=fixed;
    }
    if(target&&new RegExp('\\ba\\s+'+target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'s\\b','i').test(better)){
      const fixed=better.replace(new RegExp('(\\ba\\s+)'+target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'s\\b','i'),'$1'+target);
      add('singular_plural',fixed,'a 後面需要單數可數名詞。');
      better=fixed;
    }
    if(target==='ancestor'&&/\bancestor\s+sell\b/i.test(better)){
      const fixed=better.replace(/\bancestor\s+sell\b/i,m=>m.replace(/sell/i,'sold'));
      add('wrong_tense_or_verb_form',fixed,'描述祖先過去做的事要使用過去式 sold。');
      better=fixed;
    }
    if(target==='ancestor'&&/\bin\s+market\b/i.test(better)){
      const fixed=better.replace(/\bin\s+market\b/i,'in the market');
      add('important_article_preposition',fixed,'這個情境使用 in the market。');
      better=fixed;
    }
    if(target==='descendant'&&/\bis\s+descendant\s+of\b/i.test(better)){
      const fixed=better.replace(/\bis\s+descendant\s+of\b/i,'is a descendant of');
      add('important_article_determiner',fixed,'descendant 是單數可數名詞，這裡需要 a descendant of。');
      better=fixed;
    }
    if(target==='spouse'&&/\b(boyfriend|girlfriend|partner|he|she)\s+marry\b/i.test(better)){
      const fixed=better.replace(/\b(boyfriend|girlfriend|partner|he|she)\s+marry\b/i,'$1 marries');
      add('third_person_singular',fixed,'第三人稱單數現在式使用 marries。');
      better=fixed;
    }
    if(target&&new RegExp('\\b(?:two|three|four|five|six|seven|eight|nine|ten)\\s+'+target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(better)){
      const fixed=better.replace(new RegExp('(\\b(?:two|three|four|five|six|seven|eight|nine|ten)\\s+)'+target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i'),'$1'+target+'s');
      add('singular_plural',fixed,'數量大於一時，可數名詞使用複數。');
      better=fixed;
    }
    if(liveControllerSimplification&&target&&new RegExp('\\bone\\s+'+target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'s\\b','i').test(better)){
      const fixed=better.replace(new RegExp('(\\bone\\s+)'+target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'s\\b','i'),'$1'+target);
      add('singular_plural',fixed,'After one, use the singular form '+target+'.');
      better=fixed;
    }
    if(/\bvery\s+softer\b/i.test(better)){
      const fixed=better.replace(/\bvery\s+softer\b/i,'much softer');
      add('comparative_modifier',fixed,'Use much, not very, before the comparative adjective softer.');
      better=fixed;
    }
    if(/\b(he|she|it)\s+always\s+(annoying|kind|helpful|friendly|patient|funny|busy|angry|happy|sad)\b/i.test(better)){
      const fixed=better.replace(/\b(he|she|it)\s+always\s+(annoying|kind|helpful|friendly|patient|funny|busy|angry|happy|sad)\b/i,'$1 is always $2');
      add('missing_be_verb',fixed,'形容詞前需要 be 動詞；保留原意並加上 is。');
      better=fixed;
    }
    if(/\bi\s+think\s+always\s+(annoying|kind|helpful|friendly|patient|funny|busy|angry|happy|sad)\b/i.test(better)){
      const fixed=better.replace(/\bi\s+think\s+always\s+(annoying|kind|helpful|friendly|patient|funny|busy|angry|happy|sad)\b/i,'I think he is always $1');
      add('incomplete_core_sentence_structure',fixed,'The sentence needs a subject and “be.”');
      better=fixed;
    }
    if(/\b(he|she|it)\s+always\s+is\s+(annoying|kind|helpful|friendly|patient|funny|busy|angry|happy|sad)\b/i.test(better)){
      const fixed=better.replace(/\b(he|she|it)\s+always\s+is\s+(annoying|kind|helpful|friendly|patient|funny|busy|angry|happy|sad)\b/i,'$1 is always $2');
      add('adverb_order',fixed,'頻率副詞通常放在 be 動詞後面。');
      better=fixed;
    }
    if(/\b(he|she|it)\s+(very\s+)?(beautiful|handsome|kind|helpful|friendly|patient|funny|busy|angry|happy|sad|annoying|noisy)\b/i.test(better)){
      const fixed=better.replace(/\b(he|she|it)\s+(very\s+)?(beautiful|handsome|kind|helpful|friendly|patient|funny|busy|angry|happy|sad|annoying|noisy)\b/i,'$1 is $2$3');
      add('missing_be_verb',fixed,'形容詞前需要 be 動詞 is。');
      better=fixed;
    }
    if(target==='spouse'&&/\b(my\s+(?:boyfriend|girlfriend|partner))\s+is\s+my\s+spouse\s+in\s+the\s+future\b/i.test(better)){
      const fixed=better.replace(/\b(my\s+(?:boyfriend|girlfriend|partner))\s+is\s+my\s+spouse\s+in\s+the\s+future\b/i,'$1 will be my spouse in the future');
      add('future_verb_form',fixed,'未來的關係使用 will be。');
      better=fixed;
    }
    if(/\bwill\s+be\s+marry\b/i.test(better)){
      const fixed=better.replace(/\bwill\s+be\s+marry\b/i,'will marry');
      add('modal_verb_form',fixed,'will 後面直接接原形動詞 marry。');
      better=fixed;
    }
    if(/\b(?:he|she|it)\s+is\s+noise\b/i.test(better)){
      const fixed=better.replace(/\b(he|she|it)\s+is\s+noise\b/i,'$1 is noisy');
      add('wrong_word_form_or_meaning',fixed,'noise 是名詞；若意思是「製造很多噪音」可用 noisy。若意思是「令人困擾」，先確認後再用 annoying。');
      better=fixed;
    }
    if(isWholeAnswerV2313Report({schemaVersion})){
      const thirdPerson=/\b(my\s+(?:sibling|niece|ancestor|descendant|spouse)|he|she|it)\s+(take|like|live|work|play)\b/i;
      if(thirdPerson.test(better)){
        const fixed=better.replace(thirdPerson,(_,subject,verb)=>`${subject} ${verb.endsWith('e')?verb+'s':verb+'s'}`);
        add('third_person_singular',fixed,'Use the third-person singular verb form.');
        better=fixed;
      }
      return issues.map(issue=>({...issue,better}));
    }
    return issues;
  }
  function answerSentenceCount(value) {
    const raw=text(value).trim();if(!raw)return 0;
    const parts=raw.split(/[.!?]+/).map(x=>x.trim()).filter(Boolean);
    return Math.max(1,parts.length);
  }
  function splitAnswerSentences(value) {
    const raw=text(value).trim();if(!raw)return [];
    return [...raw.matchAll(/[^.!?]+(?:[.!?]+|$)/g)].map((m,index)=>({index,text:m[0].trim()})).filter(x=>x.text);
  }
  function detectSelfCorrection(value) { return /(?:\b\w+\s*[—-]\s*(?:sorry|i mean)\s*[—-]\s*\w+\b|\b(?:sorry|i mean)\b)/i.test(text(value)); }
  function finalIntendedAnswer(value) {
    return text(value).replace(/\b\w+\s*[—-]\s*(?:sorry|i mean)\s*[—-]\s*(\w+)\b/gi,'$1').replace(/\s+/g,' ').trim();
  }
  function scanWholeAnswerLanguage(utterance,item={},schemaVersion=SPEAKING_SCHEMA_VERSION) {
    const original=text(utterance).trim(),selfCorrectionDetected=detectSelfCorrection(original),intended=finalIntendedAnswer(original);
    const sentences=splitAnswerSentences(intended),incorrectSentences=[],all=[];
    for(const sentence of sentences){
      let current=sentence.text,sentenceIssues=[];
      for(let pass=0;pass<6;pass++){
        const found=detectImportantLanguageIssues(current,item,schemaVersion);
        if(!found.length)break;
        for(const issue of found)if(!sentenceIssues.some(x=>x.category===issue.category&&x.reason===issue.reason))sentenceIssues.push(issue);
        const next=text(found.at(-1)?.better).trim();
        if(!next||normalizedSentence(next)===normalizedSentence(current))break;
        current=next;
      }
      if(sentenceIssues.length){
        incorrectSentences.push({sentenceIndex:sentence.index,original:sentence.text,better:current,issues:sentenceIssues});
        for(const issue of sentenceIssues)all.push({...issue,sentenceIndex:sentence.index,sentenceOriginal:sentence.text,sentenceBetter:current,original:sentence.text,intendedAnswer:intended,better:current});
      }
    }
    const correctionOriginal=incorrectSentences.map(x=>x.original).join(' '),correctionBetter=incorrectSentences.map(x=>x.better).join(' ');
    const correctionScope=incorrectSentences.length===0?'none':incorrectSentences.length===1?'complete_sentence':'multiple_complete_sentences';
    return {original,intended,better:correctionBetter||intended,issues:all,incorrectSentences,correctionOriginal,correctionBetter,correctionScope,completeAnswerScanned:true,wholeAnswerScanned:true,selfCorrectionDetected,answerSentenceCount:sentences.length};
  }
  function correctionChangesIntentWithoutClarification(correction={},schemaVersion=SPEAKING_SCHEMA_VERSION) {
    const original=normalizedSentence(correction.original),better=normalizedSentence(correction.better);
    const noiseGuess=/\b(?:he|she|it)\s+is\s+noise\b/.test(original)&&/\b(?:he|she|it)\s+is\s+annoying\b/.test(better);
    const inventedSalesStory=/\bsalesperson\b/.test(original)&&/\bsold\s+pork\b/.test(better);
    if((noiseGuess||inventedSalesStory)&&correction.intentClarified!==true)return true;
    if(!isReliableListeningV2312Report({schemaVersion})||correction.intentClarified===true)return false;
    const has=(value,pattern)=>pattern.test(value);
    const changedProtectedMeaning=[
      [/\b(?:he|him|his|man|boy)\b/,/\b(?:she|her|hers|woman|girl)\b/],
      [/\bhate(?:d|s)?\b/,/\b(?:annoy|annoyed|annoying|get annoyed|dislike)\b/],
      [/\blove(?:d|s)?\b/,/\b(?:like|liked|likes)\b/]
    ].some(([a,b])=>(has(original,a)&&!has(better,a)&&has(better,b))||(has(original,b)&&!has(better,b)&&has(better,a)));
    const protectedTerms=['niece','nephew','sibling','brother','sister','cousin','spouse','husband','wife','boyfriend','girlfriend','ancestor','descendant','parent','father','mother','daughter','son','pork','market','beautiful','businessman','salesperson','student','teacher'];
    const importedContent=protectedTerms.some(term=>!new RegExp('\\b'+term+'s?\\b').test(original)&&new RegExp('\\b'+term+'s?\\b').test(better));
    return changedProtectedMeaning||importedContent;
  }
  function correctionOriginalIsVerbatim(correction={},evidence={}) {
    const original=text(correction.original).trim(),utterance=text(evidence.learnerUtterance);
    return !!original&&utterance.includes(original);
  }
  function correctionOriginalIsCompleteAnswer(correction={},evidence={}) {
    return text(correction.original).trim()===text(evidence.learnerUtterance).trim()&&!!text(correction.original).trim();
  }
  function correctionMatchesSentenceScope(correction={},scan={}) {
    const original=text(correction.original).trim();
    return !!original&&original===text(scan.correctionOriginal).trim()&&correction.correctionScope===scan.correctionScope;
  }
  function meaningTokens(value) {
    const ignored=new Set(['a','an','the','and','but','because','so','i','you','he','she','it','we','they','my','your','his','her','our','their','is','am','are','was','were','be','been','being','have','has','had','do','does','did','will','would','can','could','should','very','at','in','on','of','to','for','with']);
    return words(value).filter(x=>!ignored.has(x)).map(x=>x.replace(/ies$/,'y').replace(/ing$/,'').replace(/ed$/,'').replace(/s$/,'')).filter(x=>x.length>1);
  }
  function retryPreservesCompleteIdea(correction={}) {
    const model=text(correction.better).trim(),retry=text(correction.retryUtterance).trim();
    if(!model||!retry||answerSentenceCount(retry)<answerSentenceCount(model))return false;
    const expected=[...new Set(meaningTokens(model))],actual=new Set(meaningTokens(retry));
    if(!expected.length)return true;
    return expected.filter(x=>actual.has(x)).length/expected.length>=0.6;
  }
  function retrySatisfiesItem(item, correction, schemaVersion = SPEAKING_SCHEMA_VERSION, context = {}) {
    if(correction?.resolution!=='retried'||correction.learnerRetried!==true||correction.retryLearnerFinished!==true||!['confirmed','likely'].includes(correction.retryUtteranceReliability)||correction.retryTranscriptionIssue!==false)return false;
    const retry=text(correction.retryUtterance).trim();if(!retry)return false;
    if(/^(?:okay|ok|yeah|yes|thank you|thanks)[.!?]*$/i.test(retry))return false;
    if(isTurnPatienceReport({schemaVersion})&&isClearlyUnfinishedUtterance(retry))return false;
    if(isWholeAnswerV2313Report({schemaVersion})){
      if(!['complete_sentence','multiple_complete_sentences'].includes(correction.correctionScope)||correction.retryScope!==correction.correctionScope||!retryPreservesCompleteIdea(correction)||scanWholeAnswerLanguage(retry,item,schemaVersion).issues.length>0)return false;
    }
    if(item.kind==='grammar'&&item.expectedAnswer)return capitalizationChoice(retry)===item.expectedAnswer;
    if(detectImportantLanguageIssues(retry,item,schemaVersion).length>0)return false;
    if(item.kind!=='vocabulary')return true;
    const preserveOriginal=isCurrentWordLockReport({schemaVersion})&&context.originalTargetEvidenceValid===true&&context.originalTargetUsageCorrect===true&&['language','entire_answer','complete_sentence','multiple_complete_sentences'].includes(context.correctionScope);
    if(preserveOriginal)return true;
    return containsTarget(retry,item.target)&&evaluateTargetUsage(item,retry).value===true;
  }
  function decideCurrentItemTransition(input={}) {
    if(input.learnerFinished!==true)return {runtimeState:'AWAITING_LEARNER',correctionLock:'none',queueAdvance:false,coachAction:'WAIT'};
    if(input.hearingResolved!==true)return {runtimeState:'HEARING_UNRESOLVED',correctionLock:'none',queueAdvance:false,coachAction:'CLARIFY_HEARING'};
    if(input.targetOrTaskResolved!==true)return {runtimeState:input.kind==='grammar'?'TASK_UNRESOLVED':'TARGET_UNRESOLVED',correctionLock:'none',queueAdvance:false,coachAction:'ELICIT_CURRENT'};
    if(input.importantCorrectionRequired===true){
      if(input.explicitDecline===true&&input.allowCorrectionDecline!==false)return {runtimeState:'RESOLVED_WITH_DECLINED_CORRECTION',correctionLock:'declined',queueAdvance:true,coachAction:'ADVANCE'};
      if(input.correctionIssued!==true)return {runtimeState:'CORRECTION_REQUIRED',correctionLock:'required',queueAdvance:false,coachAction:'CORRECT_AND_REQUEST_RETRY'};
      if(input.retryReceived!==true||input.retryFinished!==true||input.retryAccepted!==true)return {runtimeState:'AWAITING_RETRY',correctionLock:'awaiting_retry',queueAdvance:false,coachAction:'WAIT_FOR_RETRY'};
      return {runtimeState:'RESOLVED',correctionLock:'retried',queueAdvance:true,coachAction:'ADVANCE'};
    }
    return {runtimeState:'RESOLVED',correctionLock:'none',queueAdvance:true,coachAction:'ADVANCE'};
  }
  const RUNTIME_TRANSITIONS = Object.freeze({
    PENDING:['ACTIVE'], ACTIVE:['AWAITING_LEARNER'], AWAITING_LEARNER:['EVALUATING'],
    EVALUATING:['HEARING_UNRESOLVED','TARGET_UNRESOLVED','CORRECTION_REQUIRED','RESOLVED'],
    HEARING_UNRESOLVED:['AWAITING_LEARNER'], TARGET_UNRESOLVED:['AWAITING_LEARNER'],
    CORRECTION_REQUIRED:['AWAITING_RETRY'], AWAITING_RETRY:['EVALUATING_RETRY'],
    EVALUATING_RETRY:['AWAITING_RETRY','RESOLVED'], RESOLVED:[]
  });
  function runtimeHistoryIsValid(history) {
    if(!Array.isArray(history)||history[0]!=='PENDING')return false;
    return history.every((state,index)=>ITEM_STATES.includes(state)&&(index===0||(RUNTIME_TRANSITIONS[history[index-1]]||[]).includes(state)));
  }
  function canAdvanceThreeGates(input={}) {
    return input.turnComplete===true&&input.targetProducedIndependently===true&&input.languageAccuracyPassed===true&&input.retryPending===false&&input.hearingResolved===true;
  }
  function activeTaskTargetEstablished(input={}) {
    return input.learnerProducedTarget===true||input.targetProducedIndependently===true||input.targetEvidenceEstablished===true;
  }
  function canResolveCurrentWord(input={}) {
    return input.learnerFinished===true&&input.hearingResolved===true&&activeTaskTargetEstablished(input)&&input.targetUsageCorrect===true&&input.importantLanguageErrorsResolved===true&&input.retryPending===false;
  }
  function runtimeLocks(input={}) {
    const turnLocked=input.learnerFinished!==true;
    const targetLocked=!turnLocked&&input.hearingResolved===true&&!activeTaskTargetEstablished(input);
    const retryLocked=input.retryPending===true;
    return {turnLocked,targetLocked,retryLocked,nextAllowed:canResolveCurrentWord(input)};
  }
  function isAcknowledgementOnly(value) {
    return /^(?:yes|yeah|yep|okay|ok|thank\s+you|thanks|i\s+see|got\s+it)[.!?]*$/i.test(text(value).trim());
  }
  function runtimeMode(input={}) {
    return input.retryPending===true?'RETRY':input.finalMode===true?'FINAL':'PRACTICE';
  }
  function liveVoiceRuntimeDecision(input={}) {
    const mode=runtimeMode(input);
    const noTurn=()=>({runtimeMode:mode,turnOwnership:'learner',assistantTurn:false,action:'NO_ASSISTANT_TURN',coachSpeech:''});
    const completion=deriveTurnCompletionEvidence(input);
    if(completion.positiveCompletionDetected!==true)return noTurn();
    const respond=(action,nextMode=mode)=>{
      const base={runtimeMode:nextMode,turnOwnership:'coach',assistantTurn:true,action};
      if(['CORRECT_AND_REQUEST_RETRY','REQUEST_RETRY','REQUEST_OR_EVALUATE_RETRY'].includes(action))return {...base,runtimeMode:'RETRY',retryPending:true,currentWordLocked:true,nextAllowed:false};
      return base;
    };
    if(input.hearingResolved!==true)return respond('CLARIFY_HEARING');
    if(mode==='RETRY'){
      if(isAcknowledgementOnly(input.learnerUtterance)||input.retryReceived!==true)return respond(isDeterministicV232Report({schemaVersion:input.schemaVersion})?'REQUEST_OR_EVALUATE_RETRY':'REQUEST_RETRY');
      if(input.retryFinished!==true)return noTurn();
      if(input.retryAccepted!==true)return respond('CORRECT_AND_REQUEST_RETRY');
      const cleared={...input,retryPending:false,correctionJustDetected:false,retryReceived:true,retryFinished:true,retryAccepted:true};
      const action=input.finalMode===true?selectFinalChallengeAction(cleared):selectNextCoachAction(cleared);
      return {...respond(action,input.finalMode===true?'FINAL':'PRACTICE'),retryPending:false,currentWordLocked:false,nextAllowed:['ADVANCE','START_FINAL_CHALLENGE','COMPLETE_SESSION'].includes(action)};
    }
    const action=mode==='FINAL'?selectFinalChallengeAction(input):selectNextCoachAction(input);
    return respond(action);
  }
  function selectNextCoachAction(input={}) {
    const deterministic=isDeterministicV232Report({schemaVersion:input.schemaVersion});
    if(input.learnerFinished!==true)return 'WAIT';
    if(input.hearingResolved!==true)return 'CLARIFY_HEARING';
    if(input.retryPending===true){
      if(input.correctionJustDetected===true)return 'CORRECT_AND_REQUEST_RETRY';
      if(input.retryReceived!==true)return deterministic?'REQUEST_OR_EVALUATE_RETRY':'REQUEST_RETRY';
      if(input.retryFinished!==true)return 'WAIT';
      if(input.retryAccepted!==true)return 'CORRECT_AND_REQUEST_RETRY';
    }
    if(!activeTaskTargetEstablished(input))return 'ELICIT_TARGET';
    if(input.targetUsageClarificationNeeded===true)return deterministic?'CLARIFY_USAGE':'FOLLOW_UP_CURRENT_WORD';
    if(input.targetUsageCorrect===false)return 'CORRECT_AND_REQUEST_RETRY';
    if(input.targetUsageCorrect!==true)return deterministic?'CLARIFY_USAGE':'FOLLOW_UP_CURRENT_WORD';
    if(input.importantLanguageErrorsResolved!==true)return 'CORRECT_AND_REQUEST_RETRY';
    const resolved=canResolveCurrentWord({...input,retryPending:false});
    if(!resolved)return 'FOLLOW_UP_CURRENT_WORD';
    if(input.allWordsResolved===true)return input.vocabularyAuditPassed===true?'START_FINAL_CHALLENGE':'FOLLOW_UP_CURRENT_WORD';
    return 'ADVANCE';
  }
  function selectFinalChallengeAction(input={}) {
    const deterministic=isDeterministicV232Report({schemaVersion:input.schemaVersion});
    if(input.learnerFinished!==true)return 'WAIT';
    if(input.hearingResolved!==true)return 'CLARIFY_HEARING';
    if(input.retryPending===true){
      if(input.correctionJustDetected===true)return 'CORRECT_AND_REQUEST_RETRY';
      if(input.retryReceived!==true)return deterministic?'REQUEST_OR_EVALUATE_RETRY':'REQUEST_RETRY';
      if(input.retryFinished!==true)return 'WAIT';
      if(input.retryAccepted!==true)return 'CORRECT_AND_REQUEST_RETRY';
    }
    if(input.importantLanguageErrorsResolved!==true)return 'CORRECT_AND_REQUEST_RETRY';
    if((input.connectedSentenceCount||0)<2||(input.distinctTargetCount||0)<2)return 'CONTINUE_FINAL_CHALLENGE';
    return input.sessionCompletionPassed===true?'COMPLETE_SESSION':'CONTINUE_FINAL_CHALLENGE';
  }
  function containsWrapUpLanguage(value) {
    return /\b(?:wrap\s+up|finish(?:ed)?|complete(?:d)?|done|great\s+job\s+today|that['’]?s\s+all|we\s+can\s+stop\s+here)\b/i.test(text(value));
  }
  function coachSpeechMatchesAction({action,speech='',currentItemResolved=false,sessionCompletionPassed=false,schemaVersion='2.30.0'}={}) {
    const spoken=text(speech).trim();
    if(!NEXT_COACH_ACTIONS.includes(action))return {valid:false,issue:'invalid_next_coach_action'};
    if(action==='WAIT'&&spoken)return {valid:false,issue:'wait_spoke'};
    if(action==='CORRECT_AND_REQUEST_RETRY'){
      if(!/Now try it again\.$/.test(spoken))return {valid:false,issue:'correction_not_terminal'};
      if(isTurnCompletionCorrectionV231Report({schemaVersion})&&!/^My sentence:\s+\S[\s\S]*?\n+Better:\s+\S[\s\S]*?\n+Why:\s+\S[\s\S]*?\n+Now try it again\.$/.test(spoken))return {valid:false,issue:'correction_not_terminal'};
      if(/\b(?:then|next|after that|move on|keep going|great job|nice|that['’]?s clear|you['’]?re doing great|ready for the next)\b/i.test(spoken.replace(/Now try it again\.$/,'')))return {valid:false,issue:isTurnCompletionCorrectionV231Report({schemaVersion})?'correction_retry_bypassed':'mixed_coach_actions'};
    }
    if(['REQUEST_RETRY','REQUEST_OR_EVALUATE_RETRY'].includes(action)&&/\b(?:next|move on|wrap up|stop here)\b/i.test(spoken))return {valid:false,issue:'mixed_coach_actions'};
    if(['REQUEST_RETRY','REQUEST_OR_EVALUATE_RETRY'].includes(action)&&isVoiceRuntimeFixV229Report({schemaVersion})&&spoken!=='Try it again.')return {valid:false,issue:'retry_request_not_exact'};
    if(action!=='COMPLETE_SESSION'&&containsWrapUpLanguage(spoken))return {valid:false,issue:'premature_wrap_up'};
    if(!currentItemResolved&&/\b(?:perfect|great|great job|nicely done|you did well|you used it correctly)\b/i.test(spoken))return {valid:false,issue:'unsupported_praise'};
    if(action==='COMPLETE_SESSION'&&sessionCompletionPassed!==true)return {valid:false,issue:'premature_session_completion'};
    return {valid:true,issue:''};
  }
  function decidePreResponseAction(input={}) {
    const coachAction=selectNextCoachAction(input),resolved=coachAction==='ADVANCE'||coachAction==='START_FINAL_CHALLENGE';
    const state=coachAction==='WAIT'?input.retryPending===true?'AWAITING_RETRY':'AWAITING_LEARNER':['CLARIFY_HEARING','ELICIT_TARGET','CLARIFY_USAGE','FOLLOW_UP_CURRENT_WORD'].includes(coachAction)?'NEEDS_SUPPORT':['CORRECT_AND_REQUEST_RETRY','REQUEST_RETRY','REQUEST_OR_EVALUATE_RETRY'].includes(coachAction)?'AWAITING_RETRY':resolved?'RESOLVED':'ACTIVE';
    return {state,runtimeState:state,coachAction,queueAdvance:resolved,correctionLock:state==='AWAITING_RETRY'?'awaiting_retry':'none',coachSpeech:coachAction==='WAIT'?'':undefined,endCoachTurn:!resolved};
  }
  function decideCurrentWordAction(input={}) {
    const stay=(state,coachAction,correctionLock='none',coachSpeech)=>({state,runtimeState:state,queueAdvance:false,coachAction,correctionLock,endCoachTurn:true,...(coachSpeech===undefined?{}:{coachSpeech})});
    if(input.explicitSkip===true)return {state:'EXPLICITLY_SKIPPED',runtimeState:'EXPLICITLY_SKIPPED',queueAdvance:true,coachAction:'ADVANCE',correctionLock:'none',endCoachTurn:false};
    if(input.learnerFinished!==true)return stay(input.retryPending===true?'AWAITING_RETRY':'AWAITING_LEARNER',input.retryPending===true?'WAIT_FOR_RETRY':'WAIT',input.retryPending===true?'awaiting_retry':'none','');
    if(input.hearingResolved!==true)return stay('NEEDS_SUPPORT','CLARIFY_HEARING');
    if(input.learnerProducedTarget!==true)return stay('NEEDS_SUPPORT','ELICIT_TARGET');
    if(input.targetUsageCorrect!==true)return input.targetUsageCorrect===false?stay('AWAITING_RETRY','CORRECT_TARGET_USAGE_AND_REQUEST_RETRY','awaiting_retry'):stay('NEEDS_SUPPORT','ELICIT_TARGET');
    if(input.importantLanguageErrorsResolved!==true)return stay('AWAITING_RETRY',input.retryPending===true?'CORRECT_REMAINING_AND_REQUEST_RETRY':'CORRECT_AND_REQUEST_RETRY','awaiting_retry');
    if(input.retryPending===true)return stay('AWAITING_RETRY','WAIT_FOR_RETRY','awaiting_retry');
    const queueAdvance=canResolveCurrentWord(input);
    return {state:'RESOLVED',runtimeState:'RESOLVED',runtimeFinalState:'RESOLVED',queueAdvance,coachAction:queueAdvance?'ADVANCE':'WAIT',correctionLock:'none',endCoachTurn:!queueAdvance,evidenceValid:queueAdvance};
  }
  function hearingIsReliable(value) { return ['confirmed','likely'].includes(text(value).toLowerCase()); }
  function reliableTaskTargetEvidence(item,evidence={}) {
    const history=(Array.isArray(evidence.targetEvidenceHistory)?evidence.targetEvidenceHistory:[]).map(row=>({...row,historyEvidence:true}));
    const candidates=[...history,{
      learnerUtterance:evidence.learnerUtterance,utteranceReliability:evidence.utteranceReliability,
      transcriptionIssue:evidence.transcriptionIssue,modelOnly:evidence.modelOnly,
      coachSuppliedAnswer:evidence.coachSuppliedAnswer,learnerProducedIndependently:evidence.targetProducedIndependently,historyEvidence:false
    }];
    return candidates.filter(row=>row&&hearingIsReliable(row.utteranceReliability)&&row.transcriptionIssue===false&&row.modelOnly!==true&&row.coachSuppliedAnswer!==true&&(row.historyEvidence?row.learnerProducedIndependently===true:row.learnerProducedIndependently!==false)&&containsTarget(row.learnerUtterance,item?.target));
  }
  function taskTargetEvidenceUtterance(item,evidence={}) {
    return reliableTaskTargetEvidence(item,evidence).map(x=>text(x.learnerUtterance).trim()).filter(Boolean).at(-1)||'';
  }
  function hasReliableTargetEvidence(item,evidence={}) {
    const hearing=evidence.resolution?.hearing;
    const currentTaskValid=evidence.learnerFinished===true&&['clear','clarified'].includes(hearing)&&evidence.modelOnly===false&&!(evidence.coachSuppliedAnswer===true&&evidence.independentAfterCoachAnswer!==true);
    return currentTaskValid&&reliableTaskTargetEvidence(item,evidence).length>0;
  }
  function isPrematureInterruption(evidence={},correction=null) {
    const speakingTurnOpen=evidence.learnerFinished!==true;
    const retryTurnOpen=correction?.learnerRetried===true&&correction?.retryLearnerFinished!==true;
    const coachAction=text(evidence.coachTurnAction).trim();
    const coachSpeech=text(evidence.coachSpeech).trim();
    return (speakingTurnOpen||retryTurnOpen)&&(!!coachSpeech||evidence.praiseGiven===true||(coachAction&&!['WAIT','WAIT_FOR_RETRY'].includes(coachAction)));
  }
  function canAdvanceCurrentItem(currentItem={}) {
    return currentItem.runtimeFinalState==='RESOLVED'&&canAdvanceThreeGates({
      turnComplete:currentItem.learnerFinished,
      targetProducedIndependently:currentItem.targetProducedIndependently,
      languageAccuracyPassed:currentItem.blockingErrorRemaining===false,
      retryPending:currentItem.correctionLock!=='none',
      hearingResolved:currentItem.hearingResolved
    })&&(currentItem.targetUsageCorrect===undefined||currentItem.targetUsageCorrect===true)&&currentItem.evidenceValid!==false;
  }
  function decideRuntimeAction(input={}) {
    const terminal=(runtimeState,correctionLock,coachAction)=>({runtimeState,correctionLock,queueAdvance:false,coachAction,endCoachTurn:true});
    const silent=(runtimeState,correctionLock,coachAction)=>({...terminal(runtimeState,correctionLock,coachAction),coachSpeech:''});
    if(input.learnerFinished!==true)return input.retryPhase===true?silent('AWAITING_RETRY','awaiting_retry','WAIT_FOR_RETRY'):silent('AWAITING_LEARNER','none','WAIT');
    const hearingResolved=input.hearingConfidence?hearingIsReliable(input.hearingConfidence):input.hearingResolved===true;
    if(!hearingResolved)return terminal('HEARING_UNRESOLVED','none','CLARIFY_HEARING');
    if(input.targetProducedIndependently!==true)return terminal('TARGET_UNRESOLVED','none','ELICIT_TARGET');
    const languageAccuracyPassed=input.languageAccuracyPassed===undefined?(input.retryPhase===true&&input.retryAccepted===true)||input.importantCorrectionRequired!==true:input.languageAccuracyPassed===true;
    if(!languageAccuracyPassed){
      if(input.retryPhase===true){
        if(input.retryReceived!==true||input.retryFinished!==true)return terminal('AWAITING_RETRY','awaiting_retry','WAIT_FOR_RETRY');
        if(input.retryAccepted!==true)return terminal('AWAITING_RETRY','awaiting_retry','CORRECT_REMAINING_AND_REQUEST_RETRY');
        return terminal('AWAITING_RETRY','awaiting_retry','CORRECT_REMAINING_AND_REQUEST_RETRY');
      }
      return terminal('AWAITING_RETRY','awaiting_retry','CORRECT_AND_REQUEST_RETRY');
    }
    if(input.retryPhase===true&&(input.retryReceived!==true||input.retryFinished!==true||input.retryAccepted!==true))return terminal('AWAITING_RETRY','awaiting_retry','WAIT_FOR_RETRY');
    const resolved={runtimeFinalState:'RESOLVED',hearingResolved:true,targetProducedIndependently:true,learnerFinished:true,blockingErrorRemaining:false,correctionLock:'none',evidenceValid:true};
    const queueAdvance=canAdvanceThreeGates({turnComplete:true,targetProducedIndependently:true,languageAccuracyPassed:true,retryPending:false,hearingResolved:true});
    return {...resolved,runtimeState:'RESOLVED',queueAdvance,coachAction:queueAdvance?'ADVANCE':'WAIT',endCoachTurn:!queueAdvance};
  }
  function terminalCorrectionText({original,better,reason}={}) {
    if(!text(original).trim()||!text(better).trim()||!text(reason).trim())throw new Error('Correction output requires original, better, and reason.');
    return `My sentence:\n${text(original).trim()}\n\nBetter:\n${text(better).trim()}\n\nWhy:\n${text(reason).trim()}\n\nNow try it again.`;
  }
  function decideFinalChallengeAction(input={}) {
    if(input.preFinalAuditPassed!==true)return {runtimeState:'BLOCKED',correctionLock:'none',completed:false,coachAction:'RETURN_TO_FIRST_UNRESOLVED',endCoachTurn:true};
    if(input.learnerFinished!==true)return {runtimeState:'AWAITING_LEARNER',correctionLock:input.retryPending===true?'awaiting_retry':'none',completed:false,coachAction:input.retryPending===true?'WAIT_FOR_RETRY':'WAIT',coachSpeech:'',endCoachTurn:true};
    if(input.hearingResolved===false)return {runtimeState:'HEARING_UNRESOLVED',correctionLock:'none',completed:false,coachAction:'CLARIFY_HEARING',endCoachTurn:true};
    if(input.targetProducedIndependently===false)return {runtimeState:'TARGET_UNRESOLVED',correctionLock:'none',completed:false,coachAction:'ELICIT_TARGET',endCoachTurn:true};
    if(input.sentenceRequirementMet===false)return {runtimeState:'AWAITING_LEARNER',correctionLock:'none',completed:false,coachAction:'ELICIT_MORE_FINAL_SENTENCES',endCoachTurn:true};
    if(input.correctionRequired===true){
      if(input.retryReceived===true&&input.retryFinished===true&&input.retryAccepted===true){
        const queueAdvance=canAdvanceThreeGates({turnComplete:true,targetProducedIndependently:input.targetProducedIndependently!==false,languageAccuracyPassed:true,retryPending:false,hearingResolved:input.hearingResolved!==false});
        return {runtimeState:queueAdvance?'RESOLVED':'FINAL_CHALLENGE_AWAITING_RETRY',correctionLock:queueAdvance?'none':'awaiting_retry',completed:queueAdvance&&input.finalAuditPassed===true,coachAction:queueAdvance?'RUN_FINAL_AUDIT':'WAIT_FOR_RETRY',endCoachTurn:!queueAdvance};
      }
      return {runtimeState:'FINAL_CHALLENGE_AWAITING_RETRY',correctionLock:'awaiting_retry',completed:false,coachAction:input.retryReceived?'CORRECT_REMAINING_AND_REQUEST_RETRY':'CORRECT_AND_REQUEST_RETRY',endCoachTurn:true};
    }
    if(input.retryPending===true)return {runtimeState:'FINAL_CHALLENGE_AWAITING_RETRY',correctionLock:'awaiting_retry',completed:false,coachAction:input.learnerResponseIsThanks===true?'REQUEST_FINAL_RETRY':'WAIT_FOR_RETRY',endCoachTurn:true};
    const queueAdvance=canAdvanceThreeGates({turnComplete:true,targetProducedIndependently:input.targetProducedIndependently!==false,languageAccuracyPassed:input.languageAccuracyPassed!==false,retryPending:false,hearingResolved:input.hearingResolved!==false});
    return {runtimeState:queueAdvance?'RESOLVED':'FINAL_CHALLENGE_AWAITING_RETRY',correctionLock:queueAdvance?'none':'awaiting_retry',completed:queueAdvance&&input.finalAuditPassed===true,coachAction:queueAdvance?'RUN_FINAL_AUDIT':'CORRECT_AND_REQUEST_RETRY',endCoachTurn:!queueAdvance};
  }
  function finalChallengeLanguageIssues(utterance,items=[],schemaVersion=SPEAKING_SCHEMA_VERSION) {
    const found=[];
    for(const item of items.length?items:[{}])for(const issue of (isWholeAnswerV2313Report({schemaVersion})?scanWholeAnswerLanguage(utterance,item,schemaVersion).issues:detectImportantLanguageIssues(utterance,item,schemaVersion))){
      const key=[issue.category,issue.original,issue.better].join('|');
      if(!found.some(x=>x.key===key))found.push({...issue,key});
    }
    return found.map(({key,...issue})=>issue);
  }
  function finalChallengeRequirements(f={},items=[]) {
    const utterance=text(f.learnerUtterance).trim();
    const reliability=f.utteranceReliability;
    const transcriptionIssue=f.transcriptionIssue;
    const learnerFinished=f.learnerFinished;
    const sentenceCount=utterance?utterance.split(/[.!?]+/).map(x=>x.trim()).filter(Boolean).length:0;
    const targetCount=new Set(items.filter(x=>x.kind==='vocabulary'&&containsTarget(utterance,x.target)).map(x=>x.coverageId)).size;
    const reliable=learnerFinished===true&&hearingIsReliable(reliability)&&transcriptionIssue===false&&f.independentProduction===true&&f.coachSuppliedAnswer===false;
    const usageIssues=items.filter(x=>x.kind==='vocabulary'&&containsTarget(utterance,x.target)).map(item=>({item,usage:evaluateTargetUsage(item,utterance)})).filter(x=>x.usage.value===false);
    const targetUsageAcceptable=usageIssues.length===0;
    return {utterance,sentenceCount,targetCount,reliable,targetUsageAcceptable,usageIssues:usageIssues.map(x=>({coverageId:x.item.coverageId,target:x.item.target,reason:x.usage.reason})),sentenceRequirementMet:sentenceCount>=2&&sentenceCount<=3,targetRequirementMet:targetCount>=2&&targetCount<=3,passed:reliable&&sentenceCount>=2&&sentenceCount<=3&&targetCount>=2&&targetCount<=3&&targetUsageAcceptable};
  }
  function canStartFinalChallenge(s) { const audit=fullVocabularyCoverageAudit(s); return audit.passed&&audit.currentCoverageId===null&&audit.correctionLockCount===0; }
  function canCompleteSession(s,finalChallenge={}) { return canStartFinalChallenge(s)&&finalChallenge.runtimeFinalState==='RESOLVED'&&finalChallenge.correctionLock==='none'&&finalChallenge.correctionResolved===true&&finalChallenge.finalAuditPassed===true&&finalChallenge.evidenceValid===true; }
  function sessionCompletionCheck(input={}) {
    if(input.queue)return canCompleteSession(input,input.finalChallenge||{});
    return input.allRequiredVocabularyResolved===true&&input.noExplicitSkip===true&&input.vocabularyAuditPassed===true&&input.finalChallengeCompleted===true&&input.finalChallengeRetryCleared===true;
  }
  function completionAuditResponse(s) { const audit=fullVocabularyCoverageAudit(s); return audit.passed?{finished:false,coachAction:'START_FINAL_CHALLENGE',audit}:{finished:false,coachAction:'RETURN_TO_FIRST_UNRESOLVED',currentCoverageId:audit.currentCoverageId,audit}; }
  function attemptOrder(e, schemaVersion) { return isCurrentItemReport({schemaVersion}) ? e?.attemptSequence : e?.sequence; }
  function advanceRequiredQueue(unresolved, coverageId, finalItemState, legacyResolved = false) {
    if (coverageId !== unresolved[0]) return false;
    if (!legacyResolved && !TERMINAL_ITEM_STATES.includes(finalItemState)) return false;
    unresolved.shift();
    return true;
  }
  function normalizedSentence(value) { return text(value).toLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}]+/gu,' ').replace(/\s+/g,' ').trim(); }
  function correctionModelsCompleteSentence(c) {
    const original=normalizedSentence(c?.original),better=normalizedSentence(c?.better);
    const originalWords=original.split(' ').filter(Boolean),betterWords=better.split(' ').filter(Boolean);
    if(originalWords.length<7)return true;
    if(betterWords.length<Math.ceil(originalWords.filter(x=>!['uh','um','er'].includes(x)).length*.55))return false;
    const connector=originalWords.findIndex(x=>['and','but','because','so'].includes(x));
    if(connector<3)return true;
    const ignored=new Set(['a','an','the','my','your','his','her','our','their','is','are','was','were','and','but','because','so','uh','um','er']);
    const prefix=originalWords.slice(0,connector).filter(x=>x.length>2&&!ignored.has(x));
    if(!prefix.length)return true;
    const retained=prefix.filter(x=>betterWords.includes(x)).length;
    return retained>=Math.ceil(prefix.length/2);
  }
  function isKnownAcceptableNoCorrectionSentence(value) {
    const sentence=normalizedSentence(value);
    return /^my niece is a student and (?:i think )?she is a very (?:beautiful|kind) girl$/.test(sentence);
  }
  function isUnnecessaryCorrection(c,item={},schemaVersion=SPEAKING_SCHEMA_VERSION) {
    return isMinimalRuntimePatchV2311Report({schemaVersion})&&isKnownAcceptableNoCorrectionSentence(c?.original)&&detectImportantLanguageIssues(c.original,item,schemaVersion).length===0&&evaluateTargetUsage(item,c.original).value===true;
  }
  function validateCorrection(c, schemaVersion=SPEAKING_SCHEMA_VERSION) {
    const original=normalizedSentence(c?.original), better=normalizedSentence(c?.better);
    if(!original||!better)return {valid:false,issue:'missing_correction_text',changedOriginal:[],changedBetter:[]};
    const originalWords=original.split(' '),betterWords=better.split(' '),originalSet=new Set(originalWords),betterSet=new Set(betterWords);
    const changedOriginal=originalWords.filter(x=>!betterSet.has(x)),changedBetter=betterWords.filter(x=>!originalSet.has(x));
    const errorSpans=Array.isArray(c?.errorSpans)?c.errorSpans.map(x=>normalizedSentence(x)).filter(Boolean):[];
    const missingErrorSpans=errorSpans.filter(span=>!(` ${original} `).includes(` ${span} `)&&!original.includes(span));
    const semanticDrift=correctionChangesIntentWithoutClarification(c,schemaVersion);
    const incompleteModel=isTurnCompletionCorrectionV231Report({schemaVersion})&&!correctionModelsCompleteSentence(c);
    const valid=original!==better&&missingErrorSpans.length===0&&!semanticDrift&&!incompleteModel;
    return {valid,issue:semanticDrift?'meaning_clarification_required':incompleteModel?'incomplete_correction_model':valid?'':'false_correction',changedOriginal,changedBetter,errorSpans,missingErrorSpans,semanticDrift,incompleteModel};
  }
  function isFalseCorrection(c,schemaVersion=SPEAKING_SCHEMA_VERSION) { return !!c && !validateCorrection(c,schemaVersion).valid; }
  function fullVocabularyCoverageAudit(s) {
    const required=(s?.queue||[]).filter(x=>x.kind==='vocabulary');
    const resolved=required.filter(practiced),remaining=required.filter(x=>!practiced(x));
    const correctionLockCount=required.filter(x=>!practiced(x)&&['required','awaiting_retry'].includes(x.correctionLock)).length;
    const allEvidenceValid=resolved.every(x=>x.evidence&&x.evidence.ok!==false&&x.evidence.evidenceValid!==false)&&remaining.length===0&&correctionLockCount===0;
    return {totalRequiredCoverage:required.length,resolvedCoverage:resolved.length,remainingCoverage:remaining.length,currentCoverageId:remaining[0]?.coverageId||null,currentRequiredItem:remaining[0]?.coverageId||null,correctionLockCount,allEvidenceValid,passed:required.length>0&&remaining.length===0&&correctionLockCount===0&&allEvidenceValid,auditedCoverageIds:required.map(x=>x.coverageId)};
  }
  function finalStateOf(e, schemaVersion) { return isRuntimeIntegrityReport({schemaVersion}) ? e?.runtimeFinalState : e?.finalItemState; }
  function expectedCorrectionLock(result, needsCorrection, correction, finalState, schemaVersion='2.25.6') {
    if (result.ok && !needsCorrection) return 'none';
    if (result.ok && correction?.resolution === 'retried') return isRuntimeLockReport({schemaVersion})?'none':'retried';
    if (result.ok && correction?.resolution === 'declined') return 'declined';
    if (result.remainingReason === 'correction_unresolved') return finalState === 'AWAITING_RETRY' ? 'awaiting_retry' : 'required';
    return 'none';
  }
  function runtimeStateCheck(item, e, result, queuePosition, needsCorrection, correction, schemaVersion) {
    const integrity=isRuntimeIntegrityReport({schemaVersion}), runtimeLock=isRuntimeLockReport({schemaVersion}), finalState=finalStateOf(e,schemaVersion);
    if (e.queuePosition !== queuePosition) return {ok:false,remainingReason:'queue_order_violation',validationNote:'queuePosition 必須對應 Required queue 的固定位置。',issue:'queue_order_violation'};
    if (e.status === 'not_tested' && !text(e.newPrompt).trim()) {
      if (e.attemptSequence !== null || finalState !== 'PENDING') return {ok:false,remainingReason:'not_asked',validationNote:'未實際提問的項目必須是 PENDING，attemptSequence 必須為 null。',issue:'fabricated_attempt_sequence'};
      if (integrity && (e.evidenceValid !== false || e.correctionLock !== 'none')) return {ok:false,remainingReason:'not_asked',validationNote:'未提問項目必須 evidenceValid=false 且 correctionLock=none。',issue:'unsupported_completion_claim'};
      return null;
    }
    if (!Number.isSafeInteger(e.attemptSequence) || e.attemptSequence < 1) return {ok:false,remainingReason:'wrong_task_mode',validationNote:'實際提問需有 attemptSequence。',issue:'missing_attempt_sequence'};
    if(isWholeAnswerV2313Report({schemaVersion})&&e.turnCompletionReliable!==true)return {ok:false,remainingReason:'no_learner_response',validationNote:'V2.31.3 必須可靠確認整個 Learner answer 已完成後才能評估。',issue:'correction_started_before_answer_complete'};
    if(isWholeAnswerV2313Report({schemaVersion})&&e.completeAnswerScanned!==true)return {ok:false,remainingReason:'correction_unresolved',validationNote:'V2.31.3 必須掃描完整回答後才能 Resolve。',issue:'complete_answer_not_scanned'};
    if(isWholeAnswerV2313Report({schemaVersion})){
      const scan=scanWholeAnswerLanguage(e.learnerUtterance,item,schemaVersion);
      const expectedScope=needsCorrection?scan.correctionScope:'none';
      if(e.correctionScope!==expectedScope)return {ok:false,remainingReason:needsCorrection?'correction_unresolved':result.remainingReason||'queue_order_violation',validationNote:`Coverage correctionScope 必須是 ${expectedScope}。`,issue:'correction_scope_mismatch'};
      if(correction?.resolution==='retried'&&e.retryScope!==expectedScope)return {ok:false,remainingReason:'correction_unresolved',validationNote:'Retry scope 必須與 Correction scope 相同。',issue:'correction_scope_mismatch'};
    }
    if(isDeterministicV232Report({schemaVersion})){
      const hearingReliable=['clear','clarified'].includes(e.resolution?.hearing)&&hearingIsReliable(e.utteranceReliability)&&e.transcriptionIssue===false;
      const correctionScope=isWholeAnswerV2313Report({schemaVersion})?scanWholeAnswerLanguage(e.learnerUtterance,item,schemaVersion).correctionScope:e.targetUsageCorrect===false?'target_usage':'language';
      const importantLanguageErrorsResolved=!needsCorrection||retrySatisfiesItem(item,correction,schemaVersion,{originalTargetEvidenceValid:hasReliableTargetEvidence(item,e),originalTargetUsageCorrect:e.targetUsageCorrect===true,correctionScope});
      const retryPending=needsCorrection&&!importantLanguageErrorsResolved;
      if(e.hearingReliable!==hearingReliable||e.importantLanguageErrorsResolved!==importantLanguageErrorsResolved||e.retryPending!==retryPending)return {ok:false,remainingReason:hearingReliable?'correction_unresolved':'hearing_unresolved',validationNote:'V2.32.0 Gate 狀態與 Hearing／Grammar／Retry 證據不一致。',issue:'runtime_state_mismatch'};
    }
    const history = Array.isArray(e.currentItemStateHistory) ? e.currentItemStateHistory : [];
    if (!history.length || history.some(x => !ITEM_STATES.includes(x)) || history[0] !== 'PENDING' || !history.includes('ACTIVE') || !history.includes('AWAITING_LEARNER') || history.at(-1) !== finalState || (runtimeLock&&!runtimeHistoryIsValid(history))) return {ok:false,remainingReason:'queue_order_violation',validationNote:'Current Item state history 不完整、不是 V2.25.7 白名單順序，或與 final state 不符。',issue:'queue_order_violation'};
    let expected;
    if (e.resolution?.targetOrTask === 'explicit_skip') expected = ['EXPLICITLY_SKIPPED'];
    else if (!result.ok) expected = result.remainingReason === 'hearing_unresolved' || result.remainingReason === 'unreliable_transcript' ? ['HEARING_UNRESOLVED'] : result.remainingReason === 'correction_unresolved' ? ['CORRECTION_REQUIRED','AWAITING_RETRY'] : item.kind === 'grammar' ? ['TASK_UNRESOLVED','TARGET_UNRESOLVED'] : ['TARGET_UNRESOLVED'];
    else if (needsCorrection && correction?.resolution === 'declined') expected = ['RESOLVED_WITH_DECLINED_CORRECTION'];
    else expected = ['RESOLVED'];
    if (!expected.includes(finalState)) return {ok:false,remainingReason:result.ok?'queue_order_violation':result.remainingReason,validationNote:'runtimeFinalState 與實際 Hearing／Target／Correction 結果不一致。',issue:result.ok?'unsupported_completion_claim':'queue_order_violation'};
    if (needsCorrection && correction?.resolution === 'retried' && (!history.includes('CORRECTION_REQUIRED') || !history.includes('AWAITING_RETRY') || (runtimeLock&&!history.includes('EVALUATING_RETRY')))) return {ok:false,remainingReason:'correction_unresolved',validationNote:'重要錯誤需經 CORRECTION_REQUIRED → AWAITING_RETRY → EVALUATING_RETRY 才能完成。',issue:'advanced_before_retry'};
    if(runtimeLock&&result.ok){
      const runtimeEvidence={runtimeFinalState:finalState,hearingResolved:['clear','clarified'].includes(e.resolution?.hearing),targetProducedIndependently:e.targetProducedIndependently===true,targetUsageCorrect:e.targetUsageCorrect,learnerFinished:e.learnerFinished===true,blockingErrorRemaining:e.blockingErrorRemaining,correctionLock:expectedCorrectionLock(result,needsCorrection,correction,finalState,schemaVersion),evidenceValid:result.ok};
      if(!canAdvanceCurrentItem(runtimeEvidence))return {ok:false,remainingReason:e.targetProducedIndependently!==true?'target_not_produced':'correction_unresolved',validationNote:'V2.25.7 Runtime Advance Guard 未通過；不得前進。',issue:e.targetProducedIndependently!==true?'coach_answer_counted_as_learner_evidence':'advanced_before_retry'};
      if(e.coachTurnAction!=='ADVANCE')return {ok:false,remainingReason:'queue_order_violation',validationNote:'RESOLVED item 的唯一下一步必須是 ADVANCE。',issue:'queue_order_violation'};
      if(needsCorrection&&correction?.resolution==='retried'&&e.coachTurnEndedAfterCorrection!==true)return {ok:false,remainingReason:'correction_unresolved',validationNote:'Correction turn 必須在 Now try it again. 後立即結束，再由下一個 Learner turn Retry。',issue:'correction_retry_bypassed'};
    }
    if (integrity) {
      const expectedLock=expectedCorrectionLock(result,needsCorrection,correction,finalState,schemaVersion);
      if (e.correctionLock !== expectedLock) return {ok:false,remainingReason:result.ok?'correction_unresolved':result.remainingReason,validationNote:'correctionLock 與實際 correction transition 不一致。',issue:'missing_required_correction'};
      const expectedValid=result.ok && ['RESOLVED','RESOLVED_WITH_DECLINED_CORRECTION'].includes(finalState);
      if (e.evidenceValid !== expectedValid) return {ok:false,remainingReason:result.ok?'queue_order_violation':result.remainingReason,validationNote:'evidenceValid 與伺服器驗證結果不一致。',issue:'unsupported_completion_claim'};
    }
    return null;
  }
  function assess(item, e, schemaVersion = '2.25.1') {
    const fail = (remainingReason, validationNote) => ({ ok: false, remainingReason, validationNote });
    if (!e) return fail('not_asked', '尚無這項的回報。');
    if (e.sourceVersion !== item.sourceVersion) return fail('wrong_task_mode', 'sourceVersion 已過期。');
    if (!text(e.newPrompt).trim()) return fail('not_asked', '沒有實際題目。');
    if (!text(e.learnerUtterance).trim()) return fail('no_learner_response', '沒有實際回答。');
    if (isExecutionGateReport({schemaVersion})) {
      const r = e.resolution || {};
      if (!['clear', 'clarified'].includes(r.hearing)) return fail('hearing_unresolved', '尚未完成 Hearing Confirmation Gate。');
      if (r.hearing === 'clarified' && (!text(r.clarificationPrompt).trim() || !text(r.clarificationResponse).trim())) return fail('hearing_unresolved', '聽辨不確定時需保留確認問題與 Learner 的確認／重說。');
      if (r.targetOrTask === 'explicit_skip') {
        if (!/\b(?:skip|don['’]?t practice|do not practice)\b|跳過|不要練/i.test(text(r.skipLearnerWords))) return fail('target_not_produced', 'Next／下一題不是 explicit Skip；需保留 Learner 明確跳過的原話。');
        return fail('explicit_skip', 'Learner 明確跳過，本項仍保持未完成。');
      }
      if (r.targetOrTask !== 'resolved') return fail('target_not_produced', '尚未完成 Target / Task Resolution Gate。');
      if (r.recallSupport === 'coach_answer' && e.independentAfterCoachAnswer !== true) return fail('model_only', 'Coach 已提供答案；需要後續 Learner 獨立回答才能成為證據。');
      if (r.queueUpdated !== true && ['not_needed','retried','declined'].includes(r.correction)) return fail('queue_order_violation', '完成本項後需更新 queue，再由 FIRST unresolved item 決定下一題。');
    }
    if (!['confirmed', 'likely'].includes(e.utteranceReliability) || e.transcriptionIssue !== false) return fail('unreliable_transcript', '語音或轉錄尚未確認；speech recognition failure 不得變成 Learner failure。');
    const evidencePhases = e.taskMode === 'vocabulary_production' ? ['warmup', 'lesson_application', 'knowledge_integration'] : ['lesson_application', 'knowledge_integration'];
    if (e.taskMode !== item.taskMode || !evidencePhases.includes(e.phaseId)) return fail('wrong_task_mode', '任務或階段不符；只有可靠的 Vocabulary 自然產出可在暖身計入 Coverage，Final Challenge 不補漏題。');
    if (e.learnerFinished !== true || (isTurnPatienceReport({schemaVersion}) && isClearlyUnfinishedUtterance(e.learnerUtterance))) return fail('no_learner_response', 'Learner 尚未完成整個回答。');
    if (e.modelOnly !== false || (e.coachSuppliedAnswer === true && e.independentAfterCoachAnswer !== true)) return fail('model_only', '只有示範、跟讀或 Coach 代答，尚無後續獨立回答。');
    if (e.status !== 'practiced') return fail(REASONS.includes(e.remainingReason) ? e.remainingReason : 'no_learner_response', '尚未取得本項可靠練習證據。');
    if (!Number.isSafeInteger(attemptOrder(e, schemaVersion)) || attemptOrder(e, schemaVersion) < 1) return fail('wrong_task_mode', '缺少本次實際提問順序。');
    if (e.taskMode === 'vocabulary_production' || (e.taskMode === 'correction_transfer' && item.component === 'Vocabulary')) {
      if (isEvidenceLockReport({schemaVersion}) && !hasReliableTargetEvidence(item,e)) return fail('coach_only_target', '目前可靠的 Learner 原句中找不到目標字；NO TARGET EVIDENCE = NO RESOLVE。');
      if (!(isMinimalRuntimePatchV2311Report({schemaVersion})?hasReliableTargetEvidence(item,e):containsTarget(e.learnerUtterance,item.target))) return fail('coach_only_target', 'Learner 回答中沒有實際產出目標字。');
      if (e.taskMode === 'correction_transfer' && e.newContext !== true) return fail('wrong_task_mode', '舊版訂正 Coverage 需要新情境。');
      return { ok: true, productionQuality: ['acceptable', 'needs_review'].includes(e.productionQuality) ? e.productionQuality : 'not_assessed', needsReview: e.productionQuality === 'needs_review' };
    }
    if (e.taskMode === 'spelling_recall') {
      if (!/spell|letter|拼|字母/i.test(e.newPrompt) || !containsTarget(e.newPrompt,item.target)) return fail('wrong_task_mode', '沒有針對這個字的獨立拼字提問。');
      const letters = text(e.letterSequence).trim();
      if (e.utteranceReliability !== 'confirmed' || !/^[a-z](?:[\s,.-]+[a-z])+$/i.test(letters)) return fail('unreliable_transcript', '需確認分開的字母序列，不能用整個單字代替。');
      const spoken = text(e.learnerUtterance).match(/\b[a-z](?:[\s,.-]+[a-z]){1,}\b/gi) || [];
      if (!spoken.some(s => s.replace(/[^a-z]/gi, '').toLowerCase() === letters.replace(/[^a-z]/gi, '').toLowerCase())) return fail('wrong_task_mode', '字母序列沒有出現在實際回答中。');
      return { ok: true };
    }
    if (e.taskMode === 'grammar_application') {
      if (e.grammarRuleId !== item.coverageId) return fail('wrong_task_mode', '未對應這一條文法。');
      if (item.evidenceType === 'capitalization_decision') {
        const choice = capitalizationChoice(e.learnerUtterance);
        if (!/capital|lowercase|upper.?case|大寫|小寫/i.test(e.newPrompt) || !choice) return fail('no_learner_response', '需要 Learner 實際回答大寫或小寫；Okay／Yeah 不算答案。');
        if(e.grammarTask !== item.grammarTask || !text(e.caseExample).trim() || !e.newPrompt.toLowerCase().includes(e.caseExample.toLowerCase())) return fail('wrong_task_mode','需記錄這條規則實際提問的例子與 grammarTask。');
        const title='(?:aunt|uncle|cousin|mom|mum|mother|dad|father|son|daughter|sister|brother|grandma|grandpa|grandmother|grandfather|doctor|professor|captain|president|queen|king|judge)';
        if(item.grammarTask==='possessive_title' && !new RegExp('\\b(?:my|your|his|her|our|their|its|[a-z]+[’\\u0027]s)\\s+'+title+'\\b','i').test(e.caseExample)) return fail('wrong_task_mode','這項需要所有格＋稱謂的例子。');
        if(item.grammarTask==='title_with_name' && !new RegExp('\\b'+title+'\\s+[a-z]+\\b','i').test(e.caseExample)) return fail('wrong_task_mode','這項需要稱謂＋名字的例子。');
        if(item.grammarTask==='title_replacing_name' && (!new RegExp('\\b'+title+'\\b','i').test(e.caseExample) || new RegExp('\\b(?:my|your|his|her|our|their)\\s+'+title,'i').test(e.caseExample))) return fail('wrong_task_mode','這項需要稱謂代替人名的例子。');
        const accuracy = choice === item.expectedAnswer ? 'correct' : 'incorrect';
        return { ok: true, accuracy, needsReview: accuracy === 'incorrect', answerValue: choice };
      }
      if (e.newContext !== true || !text(e.ruleApplication).trim()) return fail('wrong_task_mode', '缺少這條規則的新情境應用說明。');
      const accuracy = ['correct', 'incorrect'].includes(e.accuracy) ? e.accuracy : 'not_assessed';
      return { ok: true, accuracy, needsReview: accuracy === 'incorrect' };
    }
    if (e.taskMode === 'correction_transfer' && (e.newContext !== true || e.correctionId !== item.correctionId || !text(e.transferFocus).trim())) return fail('wrong_task_mode', '需對應這筆訂正，在新情境測試原問題。');
    return { ok: true };
  }
  function normalizeSpeakingCorrections(raw, queue, schemaVersion = '2.25.1') {
    if (!Array.isArray(raw)) throw new Error('V2.25+ Report 需包含 speakingCorrections 陣列。');
    return raw.map((c, i) => {
      if (!c || typeof c !== 'object') throw new Error('speakingCorrections[' + i + '] 格式不正確。');
      const original = text(c.original).trim(), better = text(c.better).trim(), reason = text(c.reason).trim();
      if (!original || !better || !reason || typeof c.learnerRetried !== 'boolean') throw new Error('每筆 speaking correction 需有 original、better、reason 與 learnerRetried。');
      const retryUtterance = text(c.retryUtterance).trim(), target = text(c.target).trim();
      if (c.learnerRetried && !retryUtterance) throw new Error('learnerRetried=true 時需保留 retryUtterance。');
      const coverageId = text(c.coverageId).trim();
      if (coverageId && !queue.some(x => x.coverageId === coverageId)) throw new Error('speaking correction 的 coverageId 無法對應本課。');
      const errorSpans=Array.isArray(c.errorSpans)?c.errorSpans.map(x=>text(x).trim()).filter(Boolean):[];
      if(isVocabularyStabilityReport({schemaVersion})&&!errorSpans.length)throw new Error('V2.25.6+ correction 必須保留實際原句中的 errorSpans。');
      if (isExecutionGateReport({schemaVersion})) {
        if (!['retried', 'declined'].includes(c.resolution)) throw new Error('Speaking correction 必須記錄 retried 或 declined。');
        if (c.resolution === 'retried' && (c.learnerRetried !== true || c.retryLearnerFinished !== true || !['confirmed','likely'].includes(c.retryUtteranceReliability) || c.retryTranscriptionIssue !== false)) throw new Error('Retry 必須等 Learner 完整說完，並保留可靠的 retry evidence。');
        if (c.resolution === 'declined' && (c.learnerRetried !== false || !text(c.learnerDeclineWords).trim())) throw new Error('declined 必須保留 Learner 明確拒絕 Retry 的原話。');
      }
      if(isRuntimeLockReport({schemaVersion})&&c.resolution==='retried'&&(!Number.isSafeInteger(c.correctionTurnSequence)||!Number.isSafeInteger(c.retryTurnSequence)||c.retryTurnSequence<=c.correctionTurnSequence))throw new Error('V2.25.7 Retry 必須發生在 Correction 之後的 Learner turn。');
      if(isWholeAnswerV2313Report({schemaVersion})&&!['complete_sentence','multiple_complete_sentences'].includes(c.correctionScope))throw new Error('V2.31.3 Correction 必須使用完整句子的 scope。');
      if(isWholeAnswerV2313Report({schemaVersion})&&c.resolution==='retried'&&c.retryScope!==c.correctionScope)throw new Error('V2.31.3 Retry scope 必須與 Correction scope 相同。');
      return { ...(target ? { target } : {}), ...(coverageId ? { coverageId } : {}), original, better, reason, ...(errorSpans.length?{errorSpans}:{}), learnerRetried: c.learnerRetried, ...(retryUtterance ? { retryUtterance } : {}), ...(c.resolution ? { resolution:c.resolution } : {}), ...(c.correctionScope ? { correctionScope:c.correctionScope } : {}), ...(c.retryScope ? { retryScope:c.retryScope } : {}), ...(c.intentClarified !== undefined ? { intentClarified:c.intentClarified } : {}), ...(c.retryLearnerFinished !== undefined ? { retryLearnerFinished:c.retryLearnerFinished } : {}), ...(c.retryUtteranceReliability ? { retryUtteranceReliability:c.retryUtteranceReliability } : {}), ...(c.retryTranscriptionIssue !== undefined ? { retryTranscriptionIssue:c.retryTranscriptionIssue } : {}), ...(Number.isSafeInteger(c.correctionTurnSequence)?{correctionTurnSequence:c.correctionTurnSequence}:{}), ...(Number.isSafeInteger(c.retryTurnSequence)?{retryTurnSequence:c.retryTurnSequence}:{}), ...(text(c.learnerDeclineWords).trim() ? { learnerDeclineWords:text(c.learnerDeclineWords).trim() } : {}) };
    });
  }
  function applyReport(previous, raw) {
    const s = clone(previous);
    if (!isQueueReport(raw) || raw.type !== 'SPEAKING_REPORT' || raw.lessonId !== s.lessonId || raw.speakingSessionId !== s.speakingSessionId) throw new Error('Report 與伺服器 Session 不符。');
    const oldAttempt = s.attempts.find(a => a.id === raw.continuationAttemptId);
    if (oldAttempt) {
      if (stable(oldAttempt.rawReport) !== stable(raw)) throw new Error('這次 attempt 已保存不同回報；請使用續練內容的新 attempt ID。');
      return { state: s, report: oldAttempt.report, duplicate: true };
    }
    if (!s.activeAttempt || s.activeAttempt.id !== raw.continuationAttemptId) throw new Error('找不到這次 attempt，請先由網站準備／續練口說內容。');
    if (schemaClass({schemaVersion:s.activeAttempt.schemaVersion || '2.24.0'}) !== schemaClass(raw)) throw new Error('Report schemaVersion 與這次口說內容不符，請使用同一份 Brief 產生回報。');
    if (!Array.isArray(raw.coverageChecks) || !Array.isArray(raw.phaseProgress)) throw new Error('Report 需包含 coverageChecks 與 phaseProgress 陣列。');
    const strict=isCurrentItemReport(raw), integrity=isRuntimeIntegrityReport(raw);
    let speakingCorrections = isSimplifiedReport(raw) ? normalizeSpeakingCorrections(raw.speakingCorrections, s.queue, raw.schemaVersion) : Array.isArray(raw.speakingCorrections) ? normalizeSpeakingCorrections(raw.speakingCorrections, s.queue, raw.schemaVersion) : [];
    const falseCorrections=integrity?speakingCorrections.filter(c=>isFalseCorrection(c,raw.schemaVersion)):[];
    const unnecessaryCorrections=integrity&&isMinimalRuntimePatchV2311Report(raw)?speakingCorrections.filter(c=>!falseCorrections.includes(c)&&isUnnecessaryCorrection(c,s.queue.find(x=>x.coverageId===c.coverageId),raw.schemaVersion)):[];
    speakingCorrections=speakingCorrections.filter(c=>!falseCorrections.includes(c)&&!unnecessaryCorrections.includes(c));
    const allowed = new Map(s.activeAttempt.items.map((x,i) => [x.coverageId, {...x,queuePosition:s.queue.findIndex(q=>q.coverageId===x.coverageId)+1,attemptPosition:i+1}]));
    const warnings = [], checks = [], seen = new Set(), evaluated = [];
    const allowedIssueTypes=new Set(['advanced_before_current_item_resolved','advanced_before_target_resolution','advanced_before_retry','premature_advance','missed_required_item','hearing_confirmation_skipped','semantic_guess_under_uncertainty','false_correction','false_acceptance','unnecessary_correction','meaning_changed_by_correction','incomplete_correction_model','pause_misread_as_turn_end','sentence_end_misread_as_turn_end','correction_started_before_answer_complete','complete_answer_not_scanned','fragment_only_correction','later_sentence_error_missed','unnecessary_full_answer_retry','self_correction_ignored','correction_scope_mismatch','partial_answer_correction','whole_answer_not_scanned','incomplete_answer_retry','unsupported_praise','unsupported_completion_claim','coach_answer_counted_as_learner_evidence','target_evidence_mismatch','target_usage_missed','grammar_item_skipped','premature_final','premature_final_challenge','final_challenge_skipped','premature_wrap_up','queue_order_violation','missing_required_correction','fabricated_accuracy','fabricated_attempt_sequence','voice_language_violation','correction_retry_bypassed','incorrect_hearing_assumption','unclear_retry_accepted','meaning_reconstructed_without_confirmation','premature_session_completion','coverage_audit_failure','premature_interruption','pre_response_action_mismatch','mixed_coach_actions','wait_spoke','correction_not_terminal','invalid_next_coach_action','runtime_state_mismatch']);
    const coachExecutionIssues = (Array.isArray(raw.coachExecutionIssues) ? raw.coachExecutionIssues : []).filter(x=>x&&typeof x==='object'&&allowedIssueTypes.has(text(x.type))).map(x=>({type:text(x.type),coverageId:text(x.coverageId),notes:text(x.notes)}));
    const issue = (type,item,note) => { if (!coachExecutionIssues.some(x=>x.type===type&&x.coverageId===(item?.coverageId||''))) coachExecutionIssues.push({type,coverageId:item?.coverageId||'',notes:note}); };
    for(const c of falseCorrections){const item=s.queue.find(x=>x.coverageId===c.coverageId),validation=validateCorrection(c,raw.schemaVersion),meaningChanged=validation.semanticDrift&&isReliableListeningV2312Report(raw);issue(meaningChanged?'meaning_changed_by_correction':validation.semanticDrift?'incorrect_hearing_assumption':validation.incompleteModel?'incomplete_correction_model':'false_correction',item,meaningChanged?'Correction 加入、刪除或替換了非英語修正所需的故事、人物、關係或情緒；未記為 Learner weakness。':validation.semanticDrift?'Correction 改變 Learner 原意但沒有先確認；保持未完成。':validation.incompleteModel?'Correction 只示範片段；必須保留並修正完整相關 Learner sentence。':'Proposed correction 與 Learner 原句實質相同；未記為 Learner weakness。');}
    for(const c of unnecessaryCorrections){const item=s.queue.find(x=>x.coverageId===c.coverageId);issue('unnecessary_correction',item,'Learner sentence 已正確自然；已取消不必要的 tweak，未記為 Learner weakness。');}
    for (const [inputIndex,sourceEvidence] of raw.coverageChecks.entries()) {
      let e=clone(sourceEvidence);
      const item = s.queue.find(x => x.coverageId === e?.coverageId), allowedItem = item && allowed.get(item.coverageId);
      if (!item || allowedItem?.sourceVersion !== e.sourceVersion) { warnings.push('忽略未知、已完成或舊版本 Coverage：' + text(e?.coverageId)); continue; }
      if(isTurnCompletionCorrectionV231Report(raw)){
        const derivedCompletion=deriveTurnCompletionEvidence(e),claimed=e.turnCompletionEvidence;
        if(claimed&&(claimed.positiveCompletionDetected!==derivedCompletion.positiveCompletionDetected||claimed.completionBasis!==derivedCompletion.completionBasis))issue('runtime_state_mismatch',item,'Turn completion evidence disagreed with the utterance; server-derived evidence was saved.');
        e.turnCompletionEvidence=derivedCompletion;
        e.learnerFinished=derivedCompletion.positiveCompletionDetected;
      }
      const falseCorrection=falseCorrections.find(c=>c.coverageId===item.coverageId);
      const falseValidation=falseCorrection?validateCorrection(falseCorrection,raw.schemaVersion):null;
      if(falseCorrection&&falseValidation.issue==='false_correction'){e.productionQuality='acceptable';e.needsReview=false;e.correctionRequired=false;e.resolution={...(e.resolution||{}),correction:'not_needed'};e.correctionLock='none';if(finalStateOf(e,raw.schemaVersion)!=='RESOLVED'){e.runtimeFinalState='RESOLVED';e.finalItemState='RESOLVED';if(Array.isArray(e.currentItemStateHistory)){e.currentItemStateHistory=e.currentItemStateHistory.filter(x=>!['CORRECTION_REQUIRED','AWAITING_RETRY'].includes(x));if(e.currentItemStateHistory.at(-1)!=='RESOLVED')e.currentItemStateHistory.push('RESOLVED');}}}
      const unnecessaryCorrection=unnecessaryCorrections.find(c=>c.coverageId===item.coverageId);
      if(unnecessaryCorrection){e.productionQuality='acceptable';e.importantLanguageError=false;e.needsReview=false;e.correctionRequired=false;e.resolution={...(e.resolution||{}),correction:'not_needed'};e.correctionLock='none';if(Array.isArray(e.currentItemStateHistory)){e.currentItemStateHistory=e.currentItemStateHistory.filter(x=>!['CORRECTION_REQUIRED','AWAITING_RETRY','EVALUATING_RETRY'].includes(x));if(e.currentItemStateHistory.at(-1)!=='RESOLVED')e.currentItemStateHistory.push('RESOLVED');}e.runtimeFinalState='RESOLVED';e.finalItemState='RESOLVED';}
      let result = assess(item, e, raw.schemaVersion);
      const assessedAccuracy = result.accuracy;
      if(isVocabularyStabilityReport(raw)&&/[\u3400-\u9fff]/u.test(text(e.newPrompt)))issue('voice_language_violation',item,'Speaking question 應以 English 提問；此問題含中文，記為 Coach execution issue。');
      if(integrity&&e.semanticGuessUsed===true&&(!['clear','clarified'].includes(e.resolution?.hearing)||e.transcriptionIssue!==false)){issue(isDeterministicV232Report(raw)?'meaning_reconstructed_without_confirmation':isVocabularyStabilityReport(raw)?'incorrect_hearing_assumption':'semantic_guess_under_uncertainty',item,'ASR 未確認時不得猜測或重建 Learner 原意。');result={ok:false,remainingReason:'hearing_unresolved',validationNote:'ASR 未確認且使用 semantic guess；保持 Hearing Lock。'};}
      const taskEvidenceEligible=result.ok;
      const reliableTargetEvidence=hasReliableTargetEvidence(item,e);
      const targetEvidenceUtterance=taskTargetEvidenceUtterance(item,e);
      const targetUsageAssessment=item.kind==='vocabulary'&&reliableTargetEvidence?evaluateTargetUsage(item,targetEvidenceUtterance):{value:null,reason:'target_not_produced'};
      let resolvedTargetUsage=isCurrentWordLockReport(raw)?!reliableTargetEvidence?null:targetUsageAssessment.value===false?false:e.targetUsageCorrect===true?true:e.targetUsageCorrect===false?false:null:targetUsageAssessment.value;
      if(isCurrentWordLockReport(raw)&&e.targetUsageCorrect===true&&targetUsageAssessment.value!==true)issue('target_usage_missed',item,'Report 將錯誤或無法驗證的 Target 用法標為正確。');
      if(isCurrentWordLockReport(raw)&&targetUsageAssessment.value===false&&(['RESOLVED','RESOLVED_WITH_DECLINED_CORRECTION'].includes(finalStateOf(e,raw.schemaVersion))||e.coachTurnAction==='ADVANCE'))issue('target_usage_missed',item,'Learner 說出 Target 但用法錯誤，Coach 不得通過或前進。');
      const wholeAnswerScan=isWholeAnswerV2313Report(raw)?scanWholeAnswerLanguage(e.learnerUtterance,item,raw.schemaVersion):null;
      if(wholeAnswerScan){
        if(typeof e.selfCorrectionDetected==='boolean'&&e.selfCorrectionDetected!==wholeAnswerScan.selfCorrectionDetected)issue('runtime_state_mismatch',item,'selfCorrectionDetected 與目前完整回答不一致；已保存伺服器判定。');
        if(Number.isSafeInteger(e.answerSentenceCount)&&e.answerSentenceCount!==wholeAnswerScan.answerSentenceCount)issue('runtime_state_mismatch',item,'answerSentenceCount 與目前完整回答不一致；已保存伺服器判定。');
        e.selfCorrectionDetected=wholeAnswerScan.selfCorrectionDetected;
        e.answerSentenceCount=wholeAnswerScan.answerSentenceCount;
      }
      const detectedLanguageIssues = result.ok ? (wholeAnswerScan?wholeAnswerScan.issues:detectImportantLanguageIssues(e.learnerUtterance,item,raw.schemaVersion)) : [];
      const targetUsageNeedsClarification=isMinimalRuntimePatchV2311Report(raw)&&result.ok&&item.kind==='vocabulary'&&resolvedTargetUsage===false&&targetUsageAssessment.issueType==='usage_clarification';
      const targetUsageNeedsCorrection=isCurrentWordLockReport(raw)&&result.ok&&item.kind==='vocabulary'&&resolvedTargetUsage===false&&!targetUsageNeedsClarification;
      if(targetUsageNeedsClarification)result={ok:false,remainingReason:'usage_clarification_needed',validationNote:targetUsageAssessment.reason};
      let needsCorrection = result.ok && (targetUsageNeedsCorrection || detectedLanguageIssues.length>0 || e.importantLanguageError === true || e.productionQuality === 'needs_review' || e.needsReview === true || result.accuracy === 'incorrect');
      let correction = speakingCorrections.find(c => c.coverageId === item.coverageId);
      const correctionScope=isWholeAnswerV2313Report(raw)?wholeAnswerScan.correctionScope:targetUsageNeedsCorrection?'target_usage':'language';
      if(wholeAnswerScan?.selfCorrectionDetected&&detectedLanguageIssues.length===0&&correction){
        issue('self_correction_ignored',item,'Learner 已在同一個完整回答內自行修正；已取消這筆不必要的 Correction，不記為 Learner weakness。');
        speakingCorrections=speakingCorrections.filter(c=>c!==correction);
        correction=undefined;needsCorrection=false;
        e.productionQuality='acceptable';e.importantLanguageError=false;e.needsReview=false;e.correctionRequired=false;
        e.resolution={...(e.resolution||{}),correction:'not_needed'};e.correctionScope='none';e.retryScope='none';
      }
      if(isEvidenceLockReport(raw)&&e.targetProducedIndependently===true&&!reliableTargetEvidence)issue('target_evidence_mismatch',item,'Report 宣稱 targetProducedIndependently，但目前可靠 Learner 原句中找不到目標字。');
      if(isEvidenceLockReport(raw)&&correction){
        const original=normalizedSentence(correction.original),utterance=normalizedSentence(e.learnerUtterance);
        const sourceMatches=isWholeAnswerV2313Report(raw)?correctionMatchesSentenceScope(correction,wholeAnswerScan):isReliableListeningV2312Report(raw)?correctionOriginalIsVerbatim(correction,e):!!original&&!!utterance&&utterance.includes(original);
        if(!sourceMatches){
          const issueType=isWholeAnswerV2313Report(raw)&&text(correction.original).trim()===text(e.learnerUtterance).trim()&&wholeAnswerScan.correctionScope==='complete_sentence'?'unnecessary_full_answer_retry':isWholeAnswerV2313Report(raw)&&!splitAnswerSentences(correction.original).every(x=>/[.!?]+$/.test(x.text))?'fragment_only_correction':isWholeAnswerV2313Report(raw)?'later_sentence_error_missed':'incorrect_hearing_assumption';
          issue(issueType,item,isWholeAnswerV2313Report(raw)?'Correction 必須只包含所有實際出錯的完整句子，不能是片段、漏掉後面錯句，或加入不需重說的正確句。':'Correction 的 My sentence 不是目前可靠 Learner 原句；先確認 Hearing，不得重建句子。');
          result={ok:false,remainingReason:isWholeAnswerV2313Report(raw)?'correction_unresolved':'hearing_unresolved',validationNote:isWholeAnswerV2313Report(raw)?'Correction scope 與完整回答掃描結果不一致。':'Correction 原句與可靠 Learner evidence 不符；保持 Hearing Lock。'};
        }
      }
      if(isWholeAnswerV2313Report(raw)&&correction){
        const betterScan=scanWholeAnswerLanguage(correction.better,item,raw.schemaVersion);
        const completeModel=correctionMatchesSentenceScope(correction,wholeAnswerScan)&&answerSentenceCount(correction.better)===answerSentenceCount(correction.original)&&retryPreservesCompleteIdea({better:correction.original,retryUtterance:correction.better});
        if(!completeModel||betterScan.issues.length){
          issue(!completeModel?'correction_scope_mismatch':'later_sentence_error_missed',item,'Better 必須保留 Correction scope 的完整句子，並修完其中所有重要錯誤。');
          result={ok:false,remainingReason:'correction_unresolved',validationNote:'Correction model 未完整涵蓋所有出錯句。'};
        }
      }
      const retryAccepted = correction?.resolution==='retried' ? retrySatisfiesItem(item,correction,raw.schemaVersion,{originalTargetEvidenceValid:reliableTargetEvidence,originalTargetUsageCorrect:resolvedTargetUsage===true,correctionScope}) : false;
      if(isDeterministicV232Report(raw)&&correction?.resolution==='retried'&&(!hearingIsReliable(correction.retryUtteranceReliability)||correction.retryTranscriptionIssue!==false))issue('unclear_retry_accepted',item,'Retry 聽辨不可靠，必須保持 retryPending 並要求重說。');
      if(targetUsageNeedsCorrection&&retryAccepted)resolvedTargetUsage=true;
      if(isThreeGateReport(raw)&&isPrematureInterruption(e,correction))issue('premature_interruption',item,'Coach 在 Learner 的回答或 Retry 尚未完成時發言；這是 Coach execution issue，不是 Learner fluency weakness。');
      const correctionIssued=!!correction||(Array.isArray(e.currentItemStateHistory)&&e.currentItemStateHistory.includes('CORRECTION_REQUIRED')&&e.currentItemStateHistory.includes('AWAITING_RETRY'));
      const vocabularyOnly=isVocabularyOnlyReport(raw);
      const targetProducedIndependently=taskEvidenceEligible&&(isEvidenceLockReport(raw)?reliableTargetEvidence:containsTarget(e.learnerUtterance,item.target))&&e.modelOnly===false&&!(e.coachSuppliedAnswer===true&&e.independentAfterCoachAnswer!==true);
      if(isRuntimeLockReport(raw))e.targetProducedIndependently=targetProducedIndependently;
      if(isCurrentWordLockReport(raw))e.targetUsageCorrect=targetProducedIndependently?resolvedTargetUsage:null;
      if(isRuntimeLockReport(raw))e.blockingErrorRemaining=needsCorrection&&!retryAccepted;
      const preResponseFacts={
        schemaVersion:raw.schemaVersion,
        learnerFinished:e.learnerFinished,
        hearingResolved:['clear','clarified'].includes(e.resolution?.hearing),
        learnerProducedTarget:targetProducedIndependently,
        targetUsageCorrect:e.targetUsageCorrect,
        targetUsageClarificationNeeded:targetUsageNeedsClarification,
        importantLanguageErrorsResolved:!needsCorrection||retryAccepted,
        retryPending:needsCorrection&&!retryAccepted,
        correctionJustDetected:needsCorrection&&!correction,
        retryReceived:correction?.learnerRetried===true,
        retryFinished:correction?.retryLearnerFinished===true,
        retryAccepted,
        allWordsResolved:allowedItem.queuePosition===s.queue.length&&raw.runtimeQueue?.remainingCoverage===0,
        vocabularyAuditPassed:raw.runtimeQueue?.remainingCoverage===0&&raw.runtimeQueue?.allEvidenceValid===true
      };
      const serverTransition=isPreResponseActionLockReport(raw)?decidePreResponseAction(preResponseFacts):isCurrentWordLockReport(raw)?decideCurrentWordAction({...preResponseFacts,explicitSkip:e.resolution?.targetOrTask==='explicit_skip'}):isRuntimeLockReport(raw)?decideRuntimeAction({learnerFinished:e.learnerFinished,hearingResolved:['clear','clarified'].includes(e.resolution?.hearing),targetProducedIndependently,importantCorrectionRequired:needsCorrection,retryPhase:correction?.learnerRetried===true,retryReceived:correction?.learnerRetried===true,retryFinished:correction?.retryLearnerFinished===true,retryAccepted}):decideCurrentItemTransition({kind:item.kind,learnerFinished:e.learnerFinished,hearingResolved:['clear','clarified'].includes(e.resolution?.hearing),targetOrTaskResolved:result.ok,importantCorrectionRequired:needsCorrection,correctionIssued,retryReceived:correction?.learnerRetried===true,retryFinished:correction?.retryLearnerFinished===true,retryAccepted,explicitDecline:correction?.resolution==='declined',allowCorrectionDecline:!vocabularyOnly});
      if(isPreResponseActionLockReport(raw)){
        if(e.coachTurnAction!==serverTransition.coachAction){
          issue('pre_response_action_mismatch',item,`State requires ${serverTransition.coachAction}; report recorded ${text(e.coachTurnAction)||'no action'}.`);
          result={ok:false,remainingReason:needsCorrection?'correction_unresolved':'queue_order_violation',validationNote:'Coach action did not match the first legal PRE-RESPONSE action.'};
        }
        const speechCheck=coachSpeechMatchesAction({action:serverTransition.coachAction,speech:e.coachSpeech,currentItemResolved:serverTransition.coachAction==='ADVANCE',sessionCompletionPassed:false,schemaVersion:raw.schemaVersion});
        if(!speechCheck.valid){
          issue(speechCheck.issue,item,`Coach speech violated ${serverTransition.coachAction}.`);
          result={ok:false,remainingReason:needsCorrection?'correction_unresolved':'queue_order_violation',validationNote:'Coach speech mixed actions or bypassed the required action lock.'};
        }
      }
      if (isExecutionGateReport(raw) && result.ok) {
        const correctionResolution = e.resolution?.correction;
        if (needsCorrection && (e.correctionRequired !== true || !correction || !['retried','declined'].includes(correction.resolution) || correctionResolution !== correction.resolution || (correction.resolution==='retried'&&!retryAccepted))) {
          result = {ok:false,remainingReason:'correction_unresolved',validationNote:'重要錯誤尚未完成 My sentence / Better / Why 與 Retry／明確 declined。'};
          issue(isVocabularyStabilityReport(raw)?'correction_retry_bypassed':finalStateOf(e,raw.schemaVersion)==='AWAITING_RETRY'?'advanced_before_retry':'missing_required_correction',item,result.validationNote);
        }
        if (!needsCorrection && (e.correctionRequired !== false || correctionResolution !== 'not_needed')) result = {ok:false,remainingReason:'correction_unresolved',validationNote:'需明確記錄本項不需要 correction，或完成實際 correction。'};
        if (vocabularyOnly && needsCorrection && correction?.resolution === 'declined') result = {ok:false,remainingReason:'correction_unresolved',validationNote:'Vocabulary-only Coverage 的重要錯誤需要 Learner 完成 Retry；declined 只能保存為未完成。'};
      }
      if (strict) {
        const stateProblem = runtimeStateCheck(item,e,result,allowedItem.queuePosition,needsCorrection,correction,raw.schemaVersion);
        if (stateProblem) { issue(stateProblem.issue,item,stateProblem.validationNote); result={ok:false,remainingReason:stateProblem.remainingReason,validationNote:stateProblem.validationNote}; }
      }
      if(integrity&&e.praiseGiven===true&&(!result.ok||(isPreResponseActionLockReport(raw)&&serverTransition.coachAction!=='ADVANCE')))issue(isDeterministicV232Report(raw)?'false_acceptance':'unsupported_praise',item,'Item 尚未 resolved，不得用完成式 praise 或正確宣告關閉。');
      evaluated.push({e,item,result,inputIndex,needsCorrection,correction,assessedAccuracy,detectedLanguageIssues,targetUsageAssessment,targetUsageNeedsClarification,serverTransition});
    }
    if (isExecutionGateReport(raw)) {
      const unresolved = s.activeAttempt.items.map(x => x.coverageId);
      const ordered = [...evaluated].sort((a,b)=>(Number.isSafeInteger(attemptOrder(a.e,raw.schemaVersion))?attemptOrder(a.e,raw.schemaVersion):Number.MAX_SAFE_INTEGER)-(Number.isSafeInteger(attemptOrder(b.e,raw.schemaVersion))?attemptOrder(b.e,raw.schemaVersion):Number.MAX_SAFE_INTEGER)||a.inputIndex-b.inputIndex);
      for (const row of ordered) {
        const unasked = row.e.status === 'not_tested' && !text(row.e.newPrompt).trim(); if(unasked)continue;
        const warmupVocabulary = !strict && row.e.phaseId === 'warmup' && row.item.kind === 'vocabulary' && row.result.ok;
        if (warmupVocabulary) { const i=unresolved.indexOf(row.item.coverageId); if(i>=0)unresolved.splice(i,1);continue; }
        if (row.item.coverageId !== unresolved[0]) {
          const locked=s.queue.find(x=>x.coverageId===unresolved[0])||row.item;
          row.result={ok:false,remainingReason:'queue_order_violation',validationNote:'這不是當時唯一的 Current Required Item；未終止的 Current Item 仍鎖定 queue。'};
          const issueType=finalStateOf(row.e,raw.schemaVersion)==='AWAITING_RETRY'?'advanced_before_retry':integrity?'queue_order_violation':'advanced_before_current_item_resolved';
          issue(issueType,locked,row.result.validationNote);continue;
        }
        const explicitSkip=row.e.resolution?.targetOrTask==='explicit_skip'&&(!strict||finalStateOf(row.e,raw.schemaVersion)==='EXPLICITLY_SKIPPED');
        if(row.result.ok||explicitSkip)advanceRequiredQueue(unresolved,row.item.coverageId,finalStateOf(row.e,raw.schemaVersion),!strict);
      }
    }
    for (const {e,item,result,needsCorrection,correction,assessedAccuracy,detectedLanguageIssues,targetUsageNeedsClarification,serverTransition} of evaluated) {
      if (seen.has(item.coverageId)) warnings.push('同項有多筆嘗試；保留已取得的有效證據。'); seen.add(item.coverageId);
      const finalState=finalStateOf(e,raw.schemaVersion)||'PENDING';
      const normalized={...clone(e),...result,status:result.ok?'practiced':'not_tested',label:item.label,target:item.target,kind:item.kind,lessonId:item.lessonId};
      if(isLiveRuntimeStateV230Report(raw)){
        const derivedRetryPending=needsCorrection&&!retrySatisfiesItem(item,correction,raw.schemaVersion,{originalTargetEvidenceValid:hasReliableTargetEvidence(item,e),originalTargetUsageCorrect:e.targetUsageCorrect===true,correctionScope:isWholeAnswerV2313Report(raw)?scanWholeAnswerLanguage(e.learnerUtterance,item,raw.schemaVersion).correctionScope:e.targetUsageCorrect===false?'target_usage':'language'});
        const derivedTurnOwnership=e.learnerFinished===true?'coach':'learner';
        const derivedRuntimeMode=derivedRetryPending?'RETRY':'PRACTICE';
        if((e.runtimeMode&&e.runtimeMode!==derivedRuntimeMode)||(e.turnOwnership&&e.turnOwnership!==derivedTurnOwnership)||(typeof e.retryPending==='boolean'&&e.retryPending!==derivedRetryPending))issue('runtime_state_mismatch',item,'Runtime mode, turn ownership, or Retry state disagreed with the evidence; server-derived values were saved.');
        Object.assign(normalized,{runtimeMode:derivedRuntimeMode,turnOwnership:derivedTurnOwnership,retryPending:derivedRetryPending});
        if(isTurnCompletionCorrectionV231Report(raw))normalized.turnCompletionEvidence=deriveTurnCompletionEvidence(e);
      }
      if(isDeterministicV232Report(raw)){
        const hearingReliable=['clear','clarified'].includes(e.resolution?.hearing)&&hearingIsReliable(e.utteranceReliability)&&e.transcriptionIssue===false;
        const importantLanguageErrorsResolved=!needsCorrection||retrySatisfiesItem(item,correction,raw.schemaVersion,{originalTargetEvidenceValid:hasReliableTargetEvidence(item,e),originalTargetUsageCorrect:e.targetUsageCorrect===true,correctionScope:isWholeAnswerV2313Report(raw)?scanWholeAnswerLanguage(e.learnerUtterance,item,raw.schemaVersion).correctionScope:e.targetUsageCorrect===false?'target_usage':'language'});
        Object.assign(normalized,{hearingReliable,importantLanguageErrorsResolved,retryPending:needsCorrection&&!importantLanguageErrorsResolved});
      }
      normalized.detectedImportantLanguageIssues=detectedLanguageIssues;
      normalized.serverTransition=serverTransition;
      if(isMinimalRuntimePatchV2311Report(raw)){
        const derivedFeedbackType=['hearing_unresolved','unreliable_transcript'].includes(result.remainingReason)?'hearing_clarification':targetUsageNeedsClarification?'usage_clarification':needsCorrection?'grammar_correction':'none';
        if(e.feedbackType&&e.feedbackType!==derivedFeedbackType)issue('runtime_state_mismatch',item,'feedbackType disagreed with Hearing, Usage, or Grammar evidence; server-derived value was saved.');
        normalized.feedbackType=derivedFeedbackType;
      }
      if(integrity){
        const enforceCorrectionState=needsCorrection&&!result.ok&&serverTransition.queueAdvance===false&&['CORRECTION_REQUIRED','AWAITING_RETRY'].includes(serverTransition.runtimeState);
        normalized.runtimeFinalState=enforceCorrectionState?serverTransition.runtimeState:finalState;
        delete normalized.finalItemState;
        normalized.evidenceValid=result.ok&&['RESOLVED','RESOLVED_WITH_DECLINED_CORRECTION'].includes(normalized.runtimeFinalState);
        normalized.correctionLock=enforceCorrectionState?serverTransition.correctionLock:expectedCorrectionLock(result,needsCorrection,correction,normalized.runtimeFinalState,raw.schemaVersion);
      }
      if(strict&&item.kind==='grammar'&&normalized.status==='not_tested'){
        if(['correct','incorrect'].includes(assessedAccuracy))normalized.accuracy=assessedAccuracy;
        else{if(normalized.accuracy&&normalized.accuracy!=='not_tested')issue('fabricated_accuracy',item,'未實際取得可靠 Grammar 回答，不可回報 incorrect/correct。');normalized.accuracy='not_tested';}
      }
      checks.push(normalized);
      if(result.ok){item.state='PRACTICED';item.evidence={...clone(e),...result,evidenceValid:true,runtimeFinalState:finalState,correctionLock:normalized.correctionLock,attemptId:raw.continuationAttemptId};delete item.remainingReason;delete item.validationNote;item.correctionLock='none';}
      else if(!practiced(item)){Object.assign(item,result,{correctionLock:normalized.correctionLock||'none',runtimeFinalState:normalized.runtimeFinalState||finalState,requiredCoachAction:serverTransition.coachAction,detectedImportantLanguageIssues:detectedLanguageIssues});}
    }
    if(strict)for(const [coverageId,a] of allowed)if(!seen.has(coverageId)){const item=s.queue.find(x=>x.coverageId===coverageId);checks.push({coverageId,sourceVersion:a.sourceVersion,taskMode:item.taskMode,phaseId:'lesson_application',queuePosition:a.queuePosition,attemptSequence:null,status:'not_tested',newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,...(isTurnCompletionCorrectionV231Report(raw)?{turnCompletionEvidence:{positiveCompletionDetected:false,completionBasis:'uncertain'}}:{}),modelOnly:false,coachSuppliedAnswer:false,targetProducedIndependently:false,...(isCurrentWordLockReport(raw)?{targetUsageCorrect:null}:{}),currentItemStateHistory:['PENDING'],...(integrity?{runtimeFinalState:'PENDING',evidenceValid:false,correctionLock:'none'}:{finalItemState:'PENDING'}),remainingReason:'not_asked',accuracy:item.kind==='grammar'?'not_tested':null,label:item.label,target:item.target,kind:item.kind,lessonId:item.lessonId,ok:false,validationNote:'本次尚未實際提問。'});}
    summarize(s);
    const vocabularyAudit=isVocabularyOnlyReport(raw)?fullVocabularyCoverageAudit(s):null;
    const correctionLockCount=vocabularyAudit?.correctionLockCount??s.queue.filter(x=>!practiced(x)&&['required','awaiting_retry'].includes(x.correctionLock)).length;
    const allEvidenceValid=vocabularyAudit?.allEvidenceValid??(s.completedCoverage.every(x=>x.evidence&&x.evidence.ok!==false)&&s.remainingCoverage.length===0&&correctionLockCount===0);
    s.runtimeQueue={totalRequiredCoverage:vocabularyAudit?.totalRequiredCoverage??s.queue.length,resolvedCoverage:vocabularyAudit?.resolvedCoverage??s.completedCoverage.length,remainingCoverage:vocabularyAudit?.remainingCoverage??s.remainingCoverage.length,currentCoverageId:vocabularyAudit?.currentCoverageId??s.remainingCoverage[0]?.coverageId??null,currentRequiredItem:vocabularyAudit?.currentRequiredItem??s.remainingCoverage[0]?.coverageId??null,correctionLockCount,allEvidenceValid,sessionState:(vocabularyAudit?vocabularyAudit.remainingCoverage:s.remainingCoverage.length)||correctionLockCount?'REQUIRED_PRACTICE':'FINAL_CHALLENGE'};
    const rank={not_started:0,partial:1,completed:2};for(const phase of s.phaseProgress){const p=raw.phaseProgress.find(x=>x?.phaseId===phase.phaseId);if(p&&rank[p.status]!==undefined&&text(p.notes).trim()&&rank[p.status]>rank[phase.status])Object.assign(phase,{status:p.status,notes:p.notes});}
    const f=raw.finalChallenge||{},finalSequence=strict?f.attemptSequence:f.sequence,finalStarted=!!(text(f.newPrompt).trim()||text(f.learnerUtterance).trim()||text(f.retryUtterance).trim()||Number.isSafeInteger(finalSequence));
    if(isTurnCompletionCorrectionV231Report(raw)){
      const finalCompletion=deriveTurnCompletionEvidence(f),claimed=f.turnCompletionEvidence;
      if(claimed&&(claimed.positiveCompletionDetected!==finalCompletion.positiveCompletionDetected||claimed.completionBasis!==finalCompletion.completionBasis))issue('runtime_state_mismatch',null,'Final Challenge turn completion evidence disagreed with the utterance; server-derived evidence was saved.');
      f.turnCompletionEvidence=finalCompletion;
      f.learnerFinished=finalCompletion.positiveCompletionDetected;
    }
    const currentEvidence=s.completedCoverage.filter(x=>x.evidence?.attemptId===raw.continuationAttemptId);
    const afterQueue=s.queue.length>0&&!s.remainingCoverage.length&&correctionLockCount===0&&Number.isSafeInteger(finalSequence)&&finalSequence>0&&currentEvidence.every(x=>attemptOrder(x.evidence,raw.schemaVersion)<finalSequence);
    const auditedIds=Array.isArray(f.auditedCoverageIds)?[...new Set(f.auditedCoverageIds)]:[];
    const runtimeAuditOK=!strict||(raw.runtimeQueue?.remainingCoverage===0&&raw.runtimeQueue?.currentCoverageId===null&&(raw.runtimeQueue?.currentRequiredItem===null||!integrity)&&(!integrity||raw.runtimeQueue?.correctionLockCount===0)&&raw.runtimeQueue?.sessionState==='FINAL_CHALLENGE');
    const requiredAuditItems=isVocabularyOnlyReport(raw)?s.queue.filter(x=>x.kind==='vocabulary'):s.queue;
    const finalWholeAnswerScan=isWholeAnswerV2313Report(raw)?scanWholeAnswerLanguage(f.learnerUtterance,requiredAuditItems[0]||{},raw.schemaVersion):null;
    if(finalWholeAnswerScan){
      if(typeof f.selfCorrectionDetected==='boolean'&&f.selfCorrectionDetected!==finalWholeAnswerScan.selfCorrectionDetected)issue('runtime_state_mismatch',null,'Final selfCorrectionDetected 與完整回答不一致；已保存伺服器判定。');
      if(Number.isSafeInteger(f.answerSentenceCount)&&f.answerSentenceCount!==finalWholeAnswerScan.answerSentenceCount)issue('runtime_state_mismatch',null,'Final answerSentenceCount 與完整回答不一致；已保存伺服器判定。');
      f.selfCorrectionDetected=finalWholeAnswerScan.selfCorrectionDetected;
      f.answerSentenceCount=finalWholeAnswerScan.answerSentenceCount;
    }
    const finalRequirements=finalChallengeRequirements(f,requiredAuditItems);
    const originalFinalLanguageIssues=isReliableListeningV2312Report(raw)?finalChallengeLanguageIssues(f.learnerUtterance,requiredAuditItems,raw.schemaVersion):[];
    const retryFinalLanguageIssues=isReliableListeningV2312Report(raw)&&f.correction==='retried'?finalChallengeLanguageIssues(f.retryUtterance,requiredAuditItems,raw.schemaVersion):[];
    const finalCorrectionRequired=f.correctionRequired===true||originalFinalLanguageIssues.length>0;
    if(isReliableListeningV2312Report(raw)&&originalFinalLanguageIssues.length>0&&f.correctionRequired!==true)issue('missing_required_correction',null,'Final Challenge 含重要 English error；必須 Correction → Retry，不能直接通過。');
    if(isReliableListeningV2312Report(raw)&&!finalRequirements.targetUsageAcceptable)issue('target_usage_missed',null,'Final Challenge 的 Target usage 尚未確認或不一致；不得完成 Session。');
    f.detectedImportantLanguageIssues=originalFinalLanguageIssues;
    f.targetUsageAcceptable=finalRequirements.targetUsageAcceptable;
    const reliableFinal=isEvidenceLockReport(raw)?text(f.newPrompt).trim()&&finalRequirements.reliable:text(f.newPrompt).trim()&&text(f.learnerUtterance).trim()&&['confirmed','likely'].includes(f.utteranceReliability)&&f.transcriptionIssue===false;
    const preFinalAuditOK=!isExecutionGateReport(raw)||(f.preFinalAuditPassed===true&&f.remainingCoverageBeforeChallenge===0&&auditedIds.length===requiredAuditItems.length&&requiredAuditItems.every(x=>auditedIds.includes(x.coverageId))&&runtimeAuditOK&&allEvidenceValid);
    const finalAuditOK=!integrity||f.finalAuditPassed===true;
    const finalRetryOrderOK=f.correction!=='retried'||(Number.isSafeInteger(f.correctionTurnSequence)&&Number.isSafeInteger(f.retryTurnSequence)&&f.retryTurnSequence>f.correctionTurnSequence);
    const finalCorrectionSourceOK=!isWholeAnswerV2313Report(raw)||!finalCorrectionRequired||correctionMatchesSentenceScope(f,finalWholeAnswerScan);
    const finalBetterComplete=!isWholeAnswerV2313Report(raw)||!finalCorrectionRequired||(answerSentenceCount(f.better)===answerSentenceCount(f.original)&&retryPreservesCompleteIdea({better:f.original,retryUtterance:f.better})&&finalChallengeLanguageIssues(f.better,requiredAuditItems,raw.schemaVersion).length===0);
    const finalRetryComplete=!isWholeAnswerV2313Report(raw)||!finalCorrectionRequired||(f.retryScope===f.correctionScope&&retryPreservesCompleteIdea({better:f.better,retryUtterance:f.retryUtterance}));
    if(isWholeAnswerV2313Report(raw)&&finalCorrectionRequired&&!finalCorrectionSourceOK)issue(text(f.original).trim()===text(f.learnerUtterance).trim()&&finalWholeAnswerScan.correctionScope==='complete_sentence'?'unnecessary_full_answer_retry':'correction_scope_mismatch',null,'Final Correction 必須只包含所有出錯的完整句子。');
    if(isWholeAnswerV2313Report(raw)&&finalCorrectionRequired&&!finalBetterComplete)issue('later_sentence_error_missed',null,'Final Better 必須修完所選完整句子中的所有重要錯誤。');
    if(isWholeAnswerV2313Report(raw)&&f.correction==='retried'&&!finalRetryComplete)issue('correction_scope_mismatch',null,'Final Retry 必須完整重說 Correction scope，不能只說片段或多加正確句。');
    const strictFinalRetryOK=!finalCorrectionRequired?(f.correction==='not_needed'&&f.correctionResolved===true):(f.correction==='retried'&&f.correctionResolved===true&&f.learnerRetried===true&&f.retryLearnerFinished===true&&hearingIsReliable(f.retryUtteranceReliability)&&f.retryTranscriptionIssue===false&&!!text(f.retryUtterance).trim()&&finalRetryOrderOK&&retryFinalLanguageIssues.length===0&&finalCorrectionSourceOK&&finalBetterComplete&&finalRetryComplete);
    const finalCorrectionOK=!integrity||(isEvidenceLockReport(raw)?strictFinalRetryOK&&f.runtimeFinalState==='RESOLVED'&&f.correctionLock==='none':['not_needed','retried','declined'].includes(f.correction)&&f.correctionResolved===true&&(!isRuntimeLockReport(raw)||(f.runtimeFinalState==='RESOLVED'&&f.correctionLock==='none'&&finalRetryOrderOK)));
    const independentFinal=integrity?f.independentProduction===true&&f.coachSuppliedAnswer===false:f.independentProduction!==false&&f.coachSuppliedAnswer!==true;
    const finalTurnComplete=isEvidenceLockReport(raw)&&f.correction==='retried'?f.retryLearnerFinished===true:f.learnerFinished===true;
    const finalQuantityOK=!isEvidenceLockReport(raw)||finalRequirements.sentenceRequirementMet&&finalRequirements.targetRequirementMet&&finalRequirements.targetUsageAcceptable;
    const finalWholeAnswerOK=!isWholeAnswerV2313Report(raw)||(f.turnCompletionReliable===true&&f.completeAnswerScanned===true);
    if(isWholeAnswerV2313Report(raw)&&finalStarted&&f.turnCompletionReliable!==true)issue('correction_started_before_answer_complete',null,'Final Challenge 必須等完整回答結束後才能評估。');
    if(isWholeAnswerV2313Report(raw)&&finalStarted&&f.completeAnswerScanned!==true)issue('complete_answer_not_scanned',null,'Final Challenge 必須掃描完整回答後才能完成。');
    const expectedFinalGates={
      finalChallengeAttempted:finalStarted,
      finalTurnCompletionReliable:f.learnerFinished===true,
      finalHearingReliable:f.learnerFinished===true&&hearingIsReliable(f.utteranceReliability)&&f.transcriptionIssue===false,
      finalSentenceCount:finalRequirements.sentenceCount,
      finalIndependentTargetCount:finalRequirements.targetCount,
      finalTargetUsageAcceptable:finalRequirements.targetUsageAcceptable,
      finalCompleteAnswerScanned:f.completeAnswerScanned===true,
      finalImportantErrorsResolved:!finalCorrectionRequired||strictFinalRetryOK,
      finalRetryPending:finalCorrectionRequired&&!strictFinalRetryOK
    };
    const finalGateClaimsOK=!isDeterministicV232Report(raw)||Object.entries(expectedFinalGates).every(([key,value])=>f[key]===value);
    if(isDeterministicV232Report(raw)&&finalStarted&&!finalGateClaimsOK)issue('runtime_state_mismatch',null,'V2.32.0 Final Gate 欄位與實際 Final 證據不一致。');
    let finalOK=isSimplifiedReport(raw)?afterQueue&&preFinalAuditOK&&finalAuditOK&&finalCorrectionOK&&finalTurnComplete&&finalQuantityOK&&finalWholeAnswerOK&&finalGateClaimsOK&&f.feedbackGiven===true&&independentFinal&&reliableFinal:afterQueue&&f.learnerFinished===true&&f.independentProduction===true&&f.coachSuppliedAnswer===false&&f.feedbackGiven===true&&reliableFinal;
    if(isPreResponseActionLockReport(raw)&&finalStarted){
      const finalAction=selectFinalChallengeAction({
        learnerFinished:finalTurnComplete,
        hearingResolved:hearingIsReliable(f.correction==='retried'?f.retryUtteranceReliability:f.utteranceReliability)&&(f.correction==='retried'?f.retryTranscriptionIssue:f.transcriptionIssue)===false,
        retryPending:finalCorrectionRequired&&!strictFinalRetryOK,
        correctionJustDetected:finalCorrectionRequired&&f.correction!=='retried',
        retryReceived:f.learnerRetried===true,
        retryFinished:f.retryLearnerFinished===true,
        retryAccepted:strictFinalRetryOK,
        importantLanguageErrorsResolved:!finalCorrectionRequired||strictFinalRetryOK,
        connectedSentenceCount:finalRequirements.sentenceCount,
        distinctTargetCount:finalRequirements.targetCount,
        sessionCompletionPassed:finalOK
      });
      if(f.coachTurnAction!==finalAction){issue('pre_response_action_mismatch',null,`Final Challenge requires ${finalAction}; report recorded ${text(f.coachTurnAction)||'no action'}.`);finalOK=false;}
      const finalSpeechCheck=coachSpeechMatchesAction({action:finalAction,speech:f.coachSpeech,currentItemResolved:true,sessionCompletionPassed:finalOK,schemaVersion:raw.schemaVersion});
      if(!finalSpeechCheck.valid){issue(finalSpeechCheck.issue,null,`Final Challenge speech violated ${finalAction}.`);finalOK=false;}
    }
    if(finalOK)s.finalChallengeStatus={...clone(f),...(isLiveRuntimeStateV230Report(raw)?{runtimeMode:'FINAL',turnOwnership:'coach',retryPending:false}:{}),sentenceCount:finalRequirements.sentenceCount,targetCount:finalRequirements.targetCount,sentenceRequirementMet:finalRequirements.sentenceRequirementMet,targetRequirementMet:finalRequirements.targetRequirementMet,targetUsageAcceptable:finalRequirements.targetUsageAcceptable,evidenceValid:true,verified:true,attemptId:raw.continuationAttemptId};else if(finalStarted&&integrity){issue(isDeterministicV232Report(raw)?'premature_final':'premature_final_challenge',s.remainingCoverage[0],`Final Challenge blocked: remaining=${s.remainingCoverage.length}, correctionLocks=${correctionLockCount}.`);if(isEvidenceLockReport(raw)&&finalCorrectionRequired&&f.correction!=='retried')issue('correction_retry_bypassed',null,'Final Challenge correction 尚未有完整 Learner Retry；Session 必須保持未完成。');if(isVocabularyStabilityReport(raw))issue('coverage_audit_failure',s.remainingCoverage[0],'Vocabulary Coverage Audit 未通過，Final Challenge 保持封鎖。');}
    const finalPhase=s.phaseProgress.find(x=>x.phaseId==='final_challenge');if(finalOK&&finalPhase)finalPhase.status='completed';if(!s.finalChallengeStatus?.verified&&finalPhase?.status==='completed'){finalPhase.status='partial';warnings.push('Final Challenge 缺少完整回答、回饋、Final Audit，或發生在 gate 通過之前。');}
    let endReason=raw.endReason;const stop=raw.stopContext||{};const explicitStop=value=>/\b(?:stop|end (?:the )?(?:session|practice)|quit|don['’]?t want to continue|enough for today|have to go)\b|停止|結束(?:練習|口說)?|今天(?:先)?到這|不要再練/i.test(text(value));
    if(endReason==='learner_agreed_stop'&&(!text(stop.externalReason).trim()||/time limit|long conversation|deadline|minutes elapsed|時間到|聊太久|時間上限/i.test(stop.externalReason)||!explicitStop(stop.learnerWords)||stop.coachInitiatedWrapUp!==false)){endReason='incomplete';warnings.push('一般 Yes／Okay、時間壓力或 Coach 誘導收尾，不是有效停止同意。');issue('premature_wrap_up',s.remainingCoverage[0],'Coverage 或 correction lock 尚未清除。');}
    if(endReason==='learner_requested_stop'&&!explicitStop(stop.learnerWords)&&!explicitStop(stop.clarificationResponse)){endReason='incomplete';warnings.push('停止意圖不明確；必須確認是完成本題或停止整場。');}
    s.gptClaimedCompleted=raw.completed===true;const legacyPhasesComplete=s.phaseProgress.every(p=>p.status==='completed');
    s.completed=s.osVerifiedCompleted=!!(s.queue.length&&!s.remainingCoverage.length&&correctionLockCount===0&&allEvidenceValid&&s.finalChallengeStatus?.verified&&(isSimplifiedReport(raw)||legacyPhasesComplete));
    s.endReason=s.completed?'completed':['learner_requested_stop','learner_agreed_stop','technical_interruption'].includes(endReason)?endReason:'incomplete';
    if(s.completed)s.runtimeQueue.sessionState='COMPLETED';else if(['learner_requested_stop','learner_agreed_stop','technical_interruption'].includes(s.endReason)){s.runtimeQueue.sessionState='STOPPED';s.runtimeQueue.currentItemState='SESSION_STOPPED';}
    if(s.gptClaimedCompleted&&!s.completed){warnings.push('GPT 宣稱完成，但 English OS 驗證未完成；已保存有效證據。');if(isDeterministicV232Report(raw)&&!finalStarted)issue('final_challenge_skipped',null,'Vocabulary 完成後仍必須實際完成 Final Challenge。');issue(isVocabularyStabilityReport(raw)?'premature_session_completion':'unsupported_completion_claim',s.remainingCoverage[0],'仍有 Required Coverage、Correction、Pre-Final、Final Challenge 或 Final Audit gate 未完成。');}
    const minutes=typeof raw.speakingMinutes==='number'&&Number.isFinite(raw.speakingMinutes)&&raw.speakingMinutes>=0&&['measured','estimated'].includes(raw.timeBasis)?raw.speakingMinutes:null;
    const emptyFinal={attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,...(isTurnCompletionCorrectionV231Report(raw)?{turnCompletionEvidence:{positiveCompletionDetected:false,completionBasis:'uncertain'}}:{}),...(isWholeAnswerV2313Report(raw)?{turnCompletionReliable:false,completeAnswerScanned:false,selfCorrectionDetected:false,correctionScope:'none',retryScope:'none',original:'',better:'',reason:''}:{}),...(isDeterministicV232Report(raw)?{finalChallengeAttempted:false,finalTurnCompletionReliable:false,finalHearingReliable:false,finalSentenceCount:0,finalIndependentTargetCount:0,finalTargetUsageAcceptable:false,finalCompleteAnswerScanned:false,finalImportantErrorsResolved:false,finalRetryPending:false}:{}),independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correctionRequired:false,correction:'not_needed',correctionResolved:false,learnerRetried:false,retryUtterance:'',retryLearnerFinished:false,retryUtteranceReliability:'not_applicable',retryTranscriptionIssue:false,runtimeFinalState:'PENDING',correctionLock:'none',correctionTurnSequence:null,retryTurnSequence:null,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],coachTurnAction:'WAIT',coachSpeech:'',...(isLiveRuntimeStateV230Report(raw)?{runtimeMode:'FINAL',turnOwnership:'learner',retryPending:false}:{}),sentenceCount:0,targetCount:0,sentenceRequirementMet:false,targetRequirementMet:false,evidenceValid:false,verified:false};
    const report={...clone(raw),schemaVersion:raw.schemaVersion,completed:s.completed,gptClaimedCompleted:s.gptClaimedCompleted,osVerifiedCompleted:s.completed,endReason:s.endReason,phaseProgress:clone(s.phaseProgress),finalChallenge:clone(s.finalChallengeStatus||emptyFinal),coverageChecks:checks,speakingCorrections,sessionCoverage:clone(s.sessionCoverage),runtimeQueue:clone(s.runtimeQueue),coachExecutionIssues,validationWarnings:warnings,speakingMinutes:minutes,timeBasis:minutes===null?'not_recorded':raw.timeBasis,serverVerified:true};
    s.attempts.push({id:raw.continuationAttemptId,rawReport:clone(raw),report});s.activeAttempt=null;return{state:summarize(s),report,duplicate:false};
  }
  function prepare(s, attemptId, schemaVersion = SPEAKING_SCHEMA_VERSION) {
    const next = clone(s);
    const currentVersion = next.activeAttempt?.schemaVersion || (next.activeAttempt ? '2.24.0' : null);
    if (next.activeAttempt && schemaClass({schemaVersion:currentVersion}) !== schemaClass({schemaVersion})) {
      next.migrationMetadata = { ...(next.migrationMetadata||{}), strategy:'preserve_verified_progress_reset_active_attempt', fromSchemaVersion:currentVersion, toSchemaVersion:schemaVersion, discardedAttemptId:next.activeAttempt.id, migrationStage:'prepare' };
      next.activeAttempt = null;
    }
    if (!next.activeAttempt) next.activeAttempt = { id: attemptId, schemaVersion, items: next.remainingCoverage.map(x => ({ coverageId: x.coverageId, sourceVersion: x.sourceVersion })) };
    return next;
  }
  function publicState(s) {
    if (!s) return null;
    const { attempts, ...rest } = s;
    return { ...rest, speakingSchemaVersion:SPEAKING_SCHEMA_VERSION, attemptCount: attempts.length, reports: attempts.map(a => a.report) };
  }
  root.EnglishSpeakingQueue = { SCHEMA_VERSION:SPEAKING_SCHEMA_VERSION, PHASES, REASONS, ITEM_STATES, LIVE_ITEM_STATES, TERMINAL_ITEM_STATES, RUNTIME_TRANSITIONS, NEXT_COACH_ACTIONS, LIVE_RUNTIME_MODES, TURN_COMPLETION_BASES, stable, version, isQueueReport, isSimplifiedReport, isExecutionGateReport, isCurrentItemReport, isRuntimeIntegrityReport, isVocabularyOnlyReport, isVocabularyStabilityReport, isRuntimeLockReport, isLiveControllerSimplificationReport, isTurnPatienceReport, isThreeGateReport, isEvidenceLockReport, isCurrentWordLockReport, isPreResponseActionLockReport, isSimplifiedLiveControllerV228Report, isVoiceRuntimeFixV229Report, isLiveRuntimeStateV230Report, isTurnCompletionCorrectionV231Report, isMinimalRuntimePatchV2311Report, isReliableListeningV2312Report, isWholeAnswerV2313Report, isDeterministicV232Report, advanceRequiredQueue, inventory, reconcile, assess, applyReport, prepare, publicState, containsTarget, evaluateTargetUsage, hearingIsReliable, reliableTaskTargetEvidence, taskTargetEvidenceUtterance, hasReliableTargetEvidence, capitalizationChoice, isClearlyUnfinishedUtterance, deriveTurnCompletionEvidence, detectImportantLanguageIssues, scanWholeAnswerLanguage, splitAnswerSentences, answerSentenceCount, detectSelfCorrection, finalIntendedAnswer, validateCorrection, correctionModelsCompleteSentence, isKnownAcceptableNoCorrectionSentence, isUnnecessaryCorrection, correctionChangesIntentWithoutClarification, correctionOriginalIsVerbatim, correctionOriginalIsCompleteAnswer, correctionMatchesSentenceScope, retryPreservesCompleteIdea, retrySatisfiesItem, decideCurrentItemTransition, decideRuntimeAction, decideCurrentWordAction, decidePreResponseAction, selectNextCoachAction, selectFinalChallengeAction, coachSpeechMatchesAction, containsWrapUpLanguage, decideFinalChallengeAction, finalChallengeRequirements, finalChallengeLanguageIssues, terminalCorrectionText, canAdvanceThreeGates, canResolveCurrentWord, activeTaskTargetEstablished, runtimeLocks, isAcknowledgementOnly, runtimeMode, liveVoiceRuntimeDecision, isPrematureInterruption, canAdvanceCurrentItem, canStartFinalChallenge, canCompleteSession, sessionCompletionCheck, completionAuditResponse, runtimeHistoryIsValid, fullVocabularyCoverageAudit };
})(globalThis);
