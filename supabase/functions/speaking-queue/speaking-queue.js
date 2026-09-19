/* Shared, deterministic Speaking runtime rules. New sessions use one schema source. */
(function (root) {
  'use strict';
  const SPEAKING_SCHEMA_VERSION = '2.25.5';
  const PHASES = ['warmup', 'lesson_application', 'knowledge_integration', 'final_challenge'];
  const REASONS = ['not_asked', 'no_learner_response', 'unreliable_transcript', 'hearing_unresolved', 'target_not_produced', 'correction_unresolved', 'queue_order_violation', 'explicit_skip', 'wrong_task_mode', 'coach_only_target', 'model_only', 'session_stopped'];
  const ITEM_STATES = ['PENDING', 'ACTIVE', 'AWAITING_LEARNER', 'HEARING_UNRESOLVED', 'TARGET_UNRESOLVED', 'TASK_UNRESOLVED', 'CORRECTION_REQUIRED', 'AWAITING_RETRY', 'RESOLVED', 'RESOLVED_WITH_DECLINED_CORRECTION', 'EXPLICITLY_SKIPPED', 'SESSION_STOPPED'];
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
  function schemaClass(raw) { return !isSimplifiedReport(raw) ? 'legacy' : isVocabularyOnlyReport(raw) ? 'vocabulary_only' : isRuntimeIntegrityReport(raw) ? 'runtime_integrity' : isCurrentItemReport(raw) ? 'current_item_lock' : isExecutionGateReport(raw) ? 'execution_gates' : 'simplified'; }
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
  function capitalizationChoice(value) {
    const v = text(value).toLowerCase();
    const lower = /\blower(?:case)?\b|小寫/.test(v), capital = /\b(?:capital|uppercase|upper-case)\b|大寫/.test(v);
    return lower === capital ? null : lower ? 'lowercase' : 'capital';
  }
  function detectImportantLanguageIssues(utterance, item = {}) {
    const original=text(utterance).trim(), issues=[];
    if(!original)return issues;
    const add=(category,better,reason)=>{if(better&&normalizedSentence(better)!==normalizedSentence(original)&&!issues.some(x=>x.category===category))issues.push({category,original,better,reason});};
    let better=original;
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
    if(/\b(?:my\s+)?niece\s+(?:is\s+)?(?:about\s+)?\d+\s+years?\s+old\b/i.test(better)&&!/\bniece\s+is\b/i.test(better)){
      const fixed=better.replace(/\b(my\s+niece|niece)\s+((?:about\s+)?\d+\s+years?\s+old)\b/i,'$1 is $2');
      add('missing_be_verb',fixed,'年齡句需要 be 動詞 is。');
      better=fixed;
    }
    const target=text(item.target).toLowerCase();
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
    }
    return issues;
  }
  function retrySatisfiesItem(item, correction) {
    if(correction?.resolution!=='retried'||correction.learnerRetried!==true||correction.retryLearnerFinished!==true||!['confirmed','likely'].includes(correction.retryUtteranceReliability)||correction.retryTranscriptionIssue!==false)return false;
    const retry=text(correction.retryUtterance).trim();if(!retry)return false;
    if(item.kind==='grammar'&&item.expectedAnswer)return capitalizationChoice(retry)===item.expectedAnswer;
    return detectImportantLanguageIssues(retry,item).length===0&&(item.kind!=='vocabulary'||containsTarget(retry,item.target));
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
  function attemptOrder(e, schemaVersion) { return isCurrentItemReport({schemaVersion}) ? e?.attemptSequence : e?.sequence; }
  function advanceRequiredQueue(unresolved, coverageId, finalItemState, legacyResolved = false) {
    if (coverageId !== unresolved[0]) return false;
    if (!legacyResolved && !TERMINAL_ITEM_STATES.includes(finalItemState)) return false;
    unresolved.shift();
    return true;
  }
  function normalizedSentence(value) { return text(value).toLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}]+/gu,' ').replace(/\s+/g,' ').trim(); }
  function validateCorrection(c) {
    const original=normalizedSentence(c?.original), better=normalizedSentence(c?.better);
    if(!original||!better)return {valid:false,issue:'missing_correction_text',changedOriginal:[],changedBetter:[]};
    const originalWords=original.split(' '),betterWords=better.split(' '),originalSet=new Set(originalWords),betterSet=new Set(betterWords);
    const changedOriginal=originalWords.filter(x=>!betterSet.has(x)),changedBetter=betterWords.filter(x=>!originalSet.has(x));
    const valid=original!==better;
    return {valid,issue:valid?'': 'false_correction',changedOriginal,changedBetter};
  }
  function isFalseCorrection(c) { return !!c && !validateCorrection(c).valid; }
  function fullVocabularyCoverageAudit(s) {
    const required=(s?.queue||[]).filter(x=>x.kind==='vocabulary');
    const resolved=required.filter(practiced),remaining=required.filter(x=>!practiced(x));
    const correctionLockCount=required.filter(x=>!practiced(x)&&['required','awaiting_retry'].includes(x.correctionLock)).length;
    const allEvidenceValid=resolved.every(x=>x.evidence&&x.evidence.ok!==false&&x.evidence.evidenceValid!==false)&&remaining.length===0&&correctionLockCount===0;
    return {totalRequiredCoverage:required.length,resolvedCoverage:resolved.length,remainingCoverage:remaining.length,currentCoverageId:remaining[0]?.coverageId||null,currentRequiredItem:remaining[0]?.coverageId||null,correctionLockCount,allEvidenceValid,passed:required.length>0&&remaining.length===0&&correctionLockCount===0&&allEvidenceValid,auditedCoverageIds:required.map(x=>x.coverageId)};
  }
  function finalStateOf(e, schemaVersion) { return isRuntimeIntegrityReport({schemaVersion}) ? e?.runtimeFinalState : e?.finalItemState; }
  function expectedCorrectionLock(result, needsCorrection, correction, finalState) {
    if (result.ok && !needsCorrection) return 'none';
    if (result.ok && correction?.resolution === 'retried') return 'retried';
    if (result.ok && correction?.resolution === 'declined') return 'declined';
    if (result.remainingReason === 'correction_unresolved') return finalState === 'AWAITING_RETRY' ? 'awaiting_retry' : 'required';
    return 'none';
  }
  function runtimeStateCheck(item, e, result, queuePosition, needsCorrection, correction, schemaVersion) {
    const integrity=isRuntimeIntegrityReport({schemaVersion}), finalState=finalStateOf(e,schemaVersion);
    if (e.queuePosition !== queuePosition) return {ok:false,remainingReason:'queue_order_violation',validationNote:'queuePosition 必須對應 Required queue 的固定位置。',issue:'queue_order_violation'};
    if (e.status === 'not_tested' && !text(e.newPrompt).trim()) {
      if (e.attemptSequence !== null || finalState !== 'PENDING') return {ok:false,remainingReason:'not_asked',validationNote:'未實際提問的項目必須是 PENDING，attemptSequence 必須為 null。',issue:'fabricated_attempt_sequence'};
      if (integrity && (e.evidenceValid !== false || e.correctionLock !== 'none')) return {ok:false,remainingReason:'not_asked',validationNote:'未提問項目必須 evidenceValid=false 且 correctionLock=none。',issue:'unsupported_completion_claim'};
      return null;
    }
    if (!Number.isSafeInteger(e.attemptSequence) || e.attemptSequence < 1) return {ok:false,remainingReason:'wrong_task_mode',validationNote:'實際提問需有 attemptSequence。',issue:'missing_attempt_sequence'};
    const history = Array.isArray(e.currentItemStateHistory) ? e.currentItemStateHistory : [];
    if (!history.length || history.some(x => !ITEM_STATES.includes(x)) || history[0] !== 'PENDING' || !history.includes('ACTIVE') || !history.includes('AWAITING_LEARNER') || history.at(-1) !== finalState) return {ok:false,remainingReason:'queue_order_violation',validationNote:'Current Item state history 不完整或順序無法驗證。',issue:'queue_order_violation'};
    let expected;
    if (e.resolution?.targetOrTask === 'explicit_skip') expected = ['EXPLICITLY_SKIPPED'];
    else if (!result.ok) expected = result.remainingReason === 'hearing_unresolved' || result.remainingReason === 'unreliable_transcript' ? ['HEARING_UNRESOLVED'] : result.remainingReason === 'correction_unresolved' ? ['CORRECTION_REQUIRED','AWAITING_RETRY'] : item.kind === 'grammar' ? ['TASK_UNRESOLVED','TARGET_UNRESOLVED'] : ['TARGET_UNRESOLVED'];
    else if (needsCorrection && correction?.resolution === 'declined') expected = ['RESOLVED_WITH_DECLINED_CORRECTION'];
    else expected = ['RESOLVED'];
    if (!expected.includes(finalState)) return {ok:false,remainingReason:result.ok?'queue_order_violation':result.remainingReason,validationNote:'runtimeFinalState 與實際 Hearing／Target／Correction 結果不一致。',issue:result.ok?'unsupported_completion_claim':'queue_order_violation'};
    if (needsCorrection && correction?.resolution === 'retried' && (!history.includes('CORRECTION_REQUIRED') || !history.includes('AWAITING_RETRY'))) return {ok:false,remainingReason:'correction_unresolved',validationNote:'重要錯誤需經 CORRECTION_REQUIRED → AWAITING_RETRY 才能完成。',issue:'advanced_before_retry'};
    if (integrity) {
      const expectedLock=expectedCorrectionLock(result,needsCorrection,correction,finalState);
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
      if (r.queueUpdated !== true && ['not_needed','retried','declined'].includes(r.correction)) return fail('queue_order_violation', '完成本項後需更新 queue，再由 FIRST unresolved item 決定下一題。');
      if (r.recallSupport === 'coach_answer' && e.independentAfterCoachAnswer !== true) return fail('model_only', 'Coach 已提供答案；需要後續 Learner 獨立回答才能成為證據。');
    }
    if (!['confirmed', 'likely'].includes(e.utteranceReliability) || e.transcriptionIssue !== false) return fail('unreliable_transcript', '語音或轉錄尚未確認；speech recognition failure 不得變成 Learner failure。');
    const evidencePhases = e.taskMode === 'vocabulary_production' ? ['warmup', 'lesson_application', 'knowledge_integration'] : ['lesson_application', 'knowledge_integration'];
    if (e.taskMode !== item.taskMode || !evidencePhases.includes(e.phaseId)) return fail('wrong_task_mode', '任務或階段不符；只有可靠的 Vocabulary 自然產出可在暖身計入 Coverage，Final Challenge 不補漏題。');
    if (e.learnerFinished !== true) return fail('no_learner_response', 'Learner 尚未完成回答。');
    if (e.modelOnly !== false || (e.coachSuppliedAnswer === true && e.independentAfterCoachAnswer !== true)) return fail('model_only', '只有示範、跟讀或 Coach 代答，尚無後續獨立回答。');
    if (e.status !== 'practiced') return fail(REASONS.includes(e.remainingReason) ? e.remainingReason : 'no_learner_response', '尚未取得本項可靠練習證據。');
    if (!Number.isSafeInteger(attemptOrder(e, schemaVersion)) || attemptOrder(e, schemaVersion) < 1) return fail('wrong_task_mode', '缺少本次實際提問順序。');
    if (e.taskMode === 'vocabulary_production' || (e.taskMode === 'correction_transfer' && item.component === 'Vocabulary')) {
      if (!containsTarget(e.learnerUtterance, item.target)) return fail('coach_only_target', 'Learner 回答中沒有實際產出目標字。');
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
      if (isExecutionGateReport({schemaVersion})) {
        if (!['retried', 'declined'].includes(c.resolution)) throw new Error('Speaking correction 必須記錄 retried 或 declined。');
        if (c.resolution === 'retried' && (c.learnerRetried !== true || c.retryLearnerFinished !== true || !['confirmed','likely'].includes(c.retryUtteranceReliability) || c.retryTranscriptionIssue !== false)) throw new Error('Retry 必須等 Learner 完整說完，並保留可靠的 retry evidence。');
        if (c.resolution === 'declined' && (c.learnerRetried !== false || !text(c.learnerDeclineWords).trim())) throw new Error('declined 必須保留 Learner 明確拒絕 Retry 的原話。');
      }
      return { ...(target ? { target } : {}), ...(coverageId ? { coverageId } : {}), original, better, reason, learnerRetried: c.learnerRetried, ...(retryUtterance ? { retryUtterance } : {}), ...(c.resolution ? { resolution:c.resolution } : {}), ...(c.retryLearnerFinished !== undefined ? { retryLearnerFinished:c.retryLearnerFinished } : {}), ...(c.retryUtteranceReliability ? { retryUtteranceReliability:c.retryUtteranceReliability } : {}), ...(c.retryTranscriptionIssue !== undefined ? { retryTranscriptionIssue:c.retryTranscriptionIssue } : {}), ...(text(c.learnerDeclineWords).trim() ? { learnerDeclineWords:text(c.learnerDeclineWords).trim() } : {}) };
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
    const falseCorrections=integrity?speakingCorrections.filter(isFalseCorrection):[];
    speakingCorrections=speakingCorrections.filter(c=>!falseCorrections.includes(c));
    const allowed = new Map(s.activeAttempt.items.map((x,i) => [x.coverageId, {...x,queuePosition:s.queue.findIndex(q=>q.coverageId===x.coverageId)+1,attemptPosition:i+1}]));
    const warnings = [], checks = [], seen = new Set(), evaluated = [];
    const allowedIssueTypes=new Set(['advanced_before_current_item_resolved','advanced_before_target_resolution','advanced_before_retry','missed_required_item','hearing_confirmation_skipped','semantic_guess_under_uncertainty','false_correction','unsupported_praise','unsupported_completion_claim','coach_answer_counted_as_learner_evidence','grammar_item_skipped','premature_final_challenge','premature_wrap_up','queue_order_violation','missing_required_correction','fabricated_accuracy','fabricated_attempt_sequence']);
    const coachExecutionIssues = (Array.isArray(raw.coachExecutionIssues) ? raw.coachExecutionIssues : []).filter(x=>x&&typeof x==='object'&&allowedIssueTypes.has(text(x.type))).map(x=>({type:text(x.type),coverageId:text(x.coverageId),notes:text(x.notes)}));
    const issue = (type,item,note) => { if (!coachExecutionIssues.some(x=>x.type===type&&x.coverageId===(item?.coverageId||''))) coachExecutionIssues.push({type,coverageId:item?.coverageId||'',notes:note}); };
    for(const c of falseCorrections){const item=s.queue.find(x=>x.coverageId===c.coverageId);issue('false_correction',item,'Proposed correction 與 Learner 原句實質相同；未記為 Learner weakness。');}
    for (const [inputIndex,sourceEvidence] of raw.coverageChecks.entries()) {
      let e=clone(sourceEvidence);
      const item = s.queue.find(x => x.coverageId === e?.coverageId), allowedItem = item && allowed.get(item.coverageId);
      if (!item || allowedItem?.sourceVersion !== e.sourceVersion) { warnings.push('忽略未知、已完成或舊版本 Coverage：' + text(e?.coverageId)); continue; }
      const falseCorrection=falseCorrections.find(c=>c.coverageId===item.coverageId);
      if(falseCorrection){e.productionQuality='acceptable';e.needsReview=false;e.correctionRequired=false;e.resolution={...(e.resolution||{}),correction:'not_needed'};e.correctionLock='none';if(finalStateOf(e,raw.schemaVersion)!=='RESOLVED'){e.runtimeFinalState='RESOLVED';e.finalItemState='RESOLVED';if(Array.isArray(e.currentItemStateHistory)){e.currentItemStateHistory=e.currentItemStateHistory.filter(x=>!['CORRECTION_REQUIRED','AWAITING_RETRY'].includes(x));if(e.currentItemStateHistory.at(-1)!=='RESOLVED')e.currentItemStateHistory.push('RESOLVED');}}}
      let result = assess(item, e, raw.schemaVersion);
      const assessedAccuracy = result.accuracy;
      if(integrity&&e.semanticGuessUsed===true&&(!['clear','clarified'].includes(e.resolution?.hearing)||e.transcriptionIssue!==false)){issue('semantic_guess_under_uncertainty',item,'ASR 未確認時不得猜測 Learner 原意。');result={ok:false,remainingReason:'hearing_unresolved',validationNote:'ASR 未確認且使用 semantic guess；保持 Hearing Lock。'};}
      const detectedLanguageIssues = result.ok ? detectImportantLanguageIssues(e.learnerUtterance,item) : [];
      const needsCorrection = result.ok && (detectedLanguageIssues.length>0 || e.importantLanguageError === true || e.productionQuality === 'needs_review' || e.needsReview === true || result.accuracy === 'incorrect');
      const correction = speakingCorrections.find(c => c.coverageId === item.coverageId);
      const retryAccepted = correction?.resolution==='retried' ? retrySatisfiesItem(item,correction) : false;
      const correctionIssued=!!correction||(Array.isArray(e.currentItemStateHistory)&&e.currentItemStateHistory.includes('CORRECTION_REQUIRED')&&e.currentItemStateHistory.includes('AWAITING_RETRY'));
      const vocabularyOnly=isVocabularyOnlyReport(raw);
      const serverTransition=decideCurrentItemTransition({kind:item.kind,learnerFinished:e.learnerFinished,hearingResolved:['clear','clarified'].includes(e.resolution?.hearing),targetOrTaskResolved:result.ok,importantCorrectionRequired:needsCorrection,correctionIssued,retryReceived:correction?.learnerRetried===true,retryFinished:correction?.retryLearnerFinished===true,retryAccepted,explicitDecline:correction?.resolution==='declined',allowCorrectionDecline:!vocabularyOnly});
      if (isExecutionGateReport(raw) && result.ok) {
        const correctionResolution = e.resolution?.correction;
        if (needsCorrection && (e.correctionRequired !== true || !correction || !['retried','declined'].includes(correction.resolution) || correctionResolution !== correction.resolution || (correction.resolution==='retried'&&!retryAccepted))) {
          result = {ok:false,remainingReason:'correction_unresolved',validationNote:'重要錯誤尚未完成 My sentence / Better / Why 與 Retry／明確 declined。'};
          issue(finalStateOf(e,raw.schemaVersion)==='AWAITING_RETRY'?'advanced_before_retry':'missing_required_correction',item,result.validationNote);
        }
        if (!needsCorrection && (e.correctionRequired !== false || correctionResolution !== 'not_needed')) result = {ok:false,remainingReason:'correction_unresolved',validationNote:'需明確記錄本項不需要 correction，或完成實際 correction。'};
        if (vocabularyOnly && needsCorrection && correction?.resolution === 'declined') result = {ok:false,remainingReason:'correction_unresolved',validationNote:'Vocabulary-only Coverage 的重要錯誤需要 Learner 完成 Retry；declined 只能保存為未完成。'};
      }
      if (strict) {
        const stateProblem = runtimeStateCheck(item,e,result,allowedItem.queuePosition,needsCorrection,correction,raw.schemaVersion);
        if (stateProblem) { issue(stateProblem.issue,item,stateProblem.validationNote); result={ok:false,remainingReason:stateProblem.remainingReason,validationNote:stateProblem.validationNote}; }
      }
      if(integrity&&e.praiseGiven===true&&!result.ok)issue('unsupported_praise',item,'Item 尚未 resolved，不得用完成式 praise 關閉。');
      evaluated.push({e,item,result,inputIndex,needsCorrection,correction,assessedAccuracy,detectedLanguageIssues,serverTransition});
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
    for (const {e,item,result,needsCorrection,correction,assessedAccuracy,detectedLanguageIssues,serverTransition} of evaluated) {
      if (seen.has(item.coverageId)) warnings.push('同項有多筆嘗試；保留已取得的有效證據。'); seen.add(item.coverageId);
      const finalState=finalStateOf(e,raw.schemaVersion)||'PENDING';
      const normalized={...clone(e),...result,status:result.ok?'practiced':'not_tested',label:item.label,target:item.target,kind:item.kind,lessonId:item.lessonId};
      normalized.detectedImportantLanguageIssues=detectedLanguageIssues;
      normalized.serverTransition=serverTransition;
      if(integrity){
        const enforceCorrectionState=needsCorrection&&!result.ok&&serverTransition.queueAdvance===false&&['CORRECTION_REQUIRED','AWAITING_RETRY'].includes(serverTransition.runtimeState);
        normalized.runtimeFinalState=enforceCorrectionState?serverTransition.runtimeState:finalState;
        delete normalized.finalItemState;
        normalized.evidenceValid=result.ok&&['RESOLVED','RESOLVED_WITH_DECLINED_CORRECTION'].includes(normalized.runtimeFinalState);
        normalized.correctionLock=enforceCorrectionState?serverTransition.correctionLock:expectedCorrectionLock(result,needsCorrection,correction,normalized.runtimeFinalState);
      }
      if(strict&&item.kind==='grammar'&&normalized.status==='not_tested'){
        if(['correct','incorrect'].includes(assessedAccuracy))normalized.accuracy=assessedAccuracy;
        else{if(normalized.accuracy&&normalized.accuracy!=='not_tested')issue('fabricated_accuracy',item,'未實際取得可靠 Grammar 回答，不可回報 incorrect/correct。');normalized.accuracy='not_tested';}
      }
      checks.push(normalized);
      if(result.ok){item.state='PRACTICED';item.evidence={...clone(e),...result,evidenceValid:true,runtimeFinalState:finalState,correctionLock:normalized.correctionLock,attemptId:raw.continuationAttemptId};delete item.remainingReason;delete item.validationNote;item.correctionLock='none';}
      else if(!practiced(item)){Object.assign(item,result,{correctionLock:normalized.correctionLock||'none',runtimeFinalState:normalized.runtimeFinalState||finalState,requiredCoachAction:serverTransition.coachAction,detectedImportantLanguageIssues:detectedLanguageIssues});}
    }
    if(strict)for(const [coverageId,a] of allowed)if(!seen.has(coverageId)){const item=s.queue.find(x=>x.coverageId===coverageId);checks.push({coverageId,sourceVersion:a.sourceVersion,taskMode:item.taskMode,phaseId:'lesson_application',queuePosition:a.queuePosition,attemptSequence:null,status:'not_tested',newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,modelOnly:false,coachSuppliedAnswer:false,currentItemStateHistory:['PENDING'],...(integrity?{runtimeFinalState:'PENDING',evidenceValid:false,correctionLock:'none'}:{finalItemState:'PENDING'}),remainingReason:'not_asked',accuracy:item.kind==='grammar'?'not_tested':null,label:item.label,target:item.target,kind:item.kind,lessonId:item.lessonId,ok:false,validationNote:'本次尚未實際提問。'});}
    summarize(s);
    const vocabularyAudit=isVocabularyOnlyReport(raw)?fullVocabularyCoverageAudit(s):null;
    const correctionLockCount=vocabularyAudit?.correctionLockCount??s.queue.filter(x=>!practiced(x)&&['required','awaiting_retry'].includes(x.correctionLock)).length;
    const allEvidenceValid=vocabularyAudit?.allEvidenceValid??(s.completedCoverage.every(x=>x.evidence&&x.evidence.ok!==false)&&s.remainingCoverage.length===0&&correctionLockCount===0);
    s.runtimeQueue={totalRequiredCoverage:vocabularyAudit?.totalRequiredCoverage??s.queue.length,resolvedCoverage:vocabularyAudit?.resolvedCoverage??s.completedCoverage.length,remainingCoverage:vocabularyAudit?.remainingCoverage??s.remainingCoverage.length,currentCoverageId:vocabularyAudit?.currentCoverageId??s.remainingCoverage[0]?.coverageId??null,currentRequiredItem:vocabularyAudit?.currentRequiredItem??s.remainingCoverage[0]?.coverageId??null,correctionLockCount,allEvidenceValid,sessionState:(vocabularyAudit?vocabularyAudit.remainingCoverage:s.remainingCoverage.length)||correctionLockCount?'REQUIRED_PRACTICE':'FINAL_CHALLENGE'};
    const rank={not_started:0,partial:1,completed:2};for(const phase of s.phaseProgress){const p=raw.phaseProgress.find(x=>x?.phaseId===phase.phaseId);if(p&&rank[p.status]!==undefined&&text(p.notes).trim()&&rank[p.status]>rank[phase.status])Object.assign(phase,{status:p.status,notes:p.notes});}
    const f=raw.finalChallenge||{},finalSequence=strict?f.attemptSequence:f.sequence,finalStarted=!!(text(f.newPrompt).trim()||text(f.learnerUtterance).trim()||Number.isSafeInteger(finalSequence));
    const currentEvidence=s.completedCoverage.filter(x=>x.evidence?.attemptId===raw.continuationAttemptId);
    const afterQueue=s.queue.length>0&&!s.remainingCoverage.length&&correctionLockCount===0&&Number.isSafeInteger(finalSequence)&&finalSequence>0&&currentEvidence.every(x=>attemptOrder(x.evidence,raw.schemaVersion)<finalSequence);
    const reliableFinal=text(f.newPrompt).trim()&&text(f.learnerUtterance).trim()&&['confirmed','likely'].includes(f.utteranceReliability)&&f.transcriptionIssue===false;
    const auditedIds=Array.isArray(f.auditedCoverageIds)?[...new Set(f.auditedCoverageIds)]:[];
    const runtimeAuditOK=!strict||(raw.runtimeQueue?.remainingCoverage===0&&raw.runtimeQueue?.currentCoverageId===null&&(raw.runtimeQueue?.currentRequiredItem===null||!integrity)&&(!integrity||raw.runtimeQueue?.correctionLockCount===0)&&raw.runtimeQueue?.sessionState==='FINAL_CHALLENGE');
    const requiredAuditItems=isVocabularyOnlyReport(raw)?s.queue.filter(x=>x.kind==='vocabulary'):s.queue;
    const preFinalAuditOK=!isExecutionGateReport(raw)||(f.preFinalAuditPassed===true&&f.remainingCoverageBeforeChallenge===0&&auditedIds.length===requiredAuditItems.length&&requiredAuditItems.every(x=>auditedIds.includes(x.coverageId))&&runtimeAuditOK&&allEvidenceValid);
    const finalAuditOK=!integrity||f.finalAuditPassed===true;
    const finalCorrectionOK=!integrity||['not_needed','retried','declined'].includes(f.correction)&&f.correctionResolved===true;
    const independentFinal=integrity?f.independentProduction===true&&f.coachSuppliedAnswer===false:f.independentProduction!==false&&f.coachSuppliedAnswer!==true;
    const finalOK=isSimplifiedReport(raw)?afterQueue&&preFinalAuditOK&&finalAuditOK&&finalCorrectionOK&&f.learnerFinished===true&&f.feedbackGiven===true&&independentFinal&&reliableFinal:afterQueue&&f.learnerFinished===true&&f.independentProduction===true&&f.coachSuppliedAnswer===false&&f.feedbackGiven===true&&reliableFinal;
    if(finalOK)s.finalChallengeStatus={...clone(f),evidenceValid:true,verified:true,attemptId:raw.continuationAttemptId};else if(finalStarted&&integrity)issue('premature_final_challenge',s.remainingCoverage[0],`Final Challenge blocked: remaining=${s.remainingCoverage.length}, correctionLocks=${correctionLockCount}.`);
    const finalPhase=s.phaseProgress.find(x=>x.phaseId==='final_challenge');if(finalOK&&finalPhase)finalPhase.status='completed';if(!s.finalChallengeStatus?.verified&&finalPhase?.status==='completed'){finalPhase.status='partial';warnings.push('Final Challenge 缺少完整回答、回饋、Final Audit，或發生在 gate 通過之前。');}
    let endReason=raw.endReason;const stop=raw.stopContext||{};const explicitStop=value=>/\b(?:stop|end (?:the )?(?:session|practice)|quit|don['’]?t want to continue|enough for today|have to go)\b|停止|結束(?:練習|口說)?|今天(?:先)?到這|不要再練/i.test(text(value));
    if(endReason==='learner_agreed_stop'&&(!text(stop.externalReason).trim()||/time limit|long conversation|deadline|minutes elapsed|時間到|聊太久|時間上限/i.test(stop.externalReason)||!explicitStop(stop.learnerWords)||stop.coachInitiatedWrapUp!==false)){endReason='incomplete';warnings.push('一般 Yes／Okay、時間壓力或 Coach 誘導收尾，不是有效停止同意。');issue('premature_wrap_up',s.remainingCoverage[0],'Coverage 或 correction lock 尚未清除。');}
    if(endReason==='learner_requested_stop'&&!explicitStop(stop.learnerWords)&&!explicitStop(stop.clarificationResponse)){endReason='incomplete';warnings.push('停止意圖不明確；必須確認是完成本題或停止整場。');}
    s.gptClaimedCompleted=raw.completed===true;const legacyPhasesComplete=s.phaseProgress.every(p=>p.status==='completed');
    s.completed=s.osVerifiedCompleted=!!(s.queue.length&&!s.remainingCoverage.length&&correctionLockCount===0&&allEvidenceValid&&s.finalChallengeStatus?.verified&&(isSimplifiedReport(raw)||legacyPhasesComplete));
    s.endReason=s.completed?'completed':['learner_requested_stop','learner_agreed_stop','technical_interruption'].includes(endReason)?endReason:'incomplete';
    if(s.completed)s.runtimeQueue.sessionState='COMPLETED';else if(['learner_requested_stop','learner_agreed_stop','technical_interruption'].includes(s.endReason)){s.runtimeQueue.sessionState='STOPPED';s.runtimeQueue.currentItemState='SESSION_STOPPED';}
    if(s.gptClaimedCompleted&&!s.completed){warnings.push('GPT 宣稱完成，但 English OS 驗證未完成；已保存有效證據。');issue('unsupported_completion_claim',s.remainingCoverage[0],'仍有 Required Coverage、Correction、Pre-Final、Final Challenge 或 Final Audit gate 未完成。');}
    const minutes=typeof raw.speakingMinutes==='number'&&Number.isFinite(raw.speakingMinutes)&&raw.speakingMinutes>=0&&['measured','estimated'].includes(raw.timeBasis)?raw.speakingMinutes:null;
    const emptyFinal={attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correction:'not_needed',correctionResolved:false,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],evidenceValid:false,verified:false};
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
  root.EnglishSpeakingQueue = { SCHEMA_VERSION:SPEAKING_SCHEMA_VERSION, PHASES, REASONS, ITEM_STATES, TERMINAL_ITEM_STATES, stable, version, isQueueReport, isSimplifiedReport, isExecutionGateReport, isCurrentItemReport, isRuntimeIntegrityReport, isVocabularyOnlyReport, advanceRequiredQueue, inventory, reconcile, assess, applyReport, prepare, publicState, containsTarget, capitalizationChoice, detectImportantLanguageIssues, validateCorrection, retrySatisfiesItem, decideCurrentItemTransition, fullVocabularyCoverageAudit };
})(globalThis);
