/* Shared, deterministic V2.24 coverage rules. No DOM, storage, network, or model calls. */
(function (root) {
  'use strict';
  const PHASES = ['warmup', 'lesson_application', 'knowledge_integration', 'final_challenge'];
  const REASONS = ['not_asked', 'no_learner_response', 'unreliable_transcript', 'wrong_task_mode', 'coach_only_target', 'model_only', 'session_stopped'];
  const text = x => typeof x === 'string' ? x : '';
  const clone = x => JSON.parse(JSON.stringify(x));
  function stable(x) { return JSON.stringify(sort(x)); }
  function sort(x) { return Array.isArray(x) ? x.map(sort) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])])) : x; }
  function version(x) {
    const s = stable(x); let a = 2166136261, b = 5381;
    for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ s.charCodeAt(i); }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  function isQueueReport(raw) { const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(text(raw?.schemaVersion)); return !!m && (+m[1] > 2 || (+m[1] === 2 && +m[2] >= 24)); }
  function inventory(lesson, corrections = []) {
    const c = lesson.curriculum || {}, items = new Map();
    function add(kind, key, target, label, taskMode, source, extra = {}) {
      if (!text(key).trim()) return;
      const coverageId = JSON.stringify([lesson.id, kind, key]);
      items.set(coverageId, { coverageId, sourceVersion: version({ policy: '2.24.0', taskMode, source }), lessonId: lesson.id, kind, target, label, taskMode, ...extra });
    }
    [...(c.mainVocabulary || []), ...(c.extendedVocabulary || [])].filter(x => !x.excludeFromPractice).forEach(x => add('vocabulary', x.term, x.term, x.term + ' · vocabulary', 'vocabulary_production', { term: x.term, meaning: x.meaning || '', partOfSpeech: x.partOfSpeech || x.pos || '' }));
    (c.grammar || []).filter(x => !x.excludeFromPractice).forEach(x => {
      const rule = typeof x === 'string' ? x : x.rule || x.title || x.name || '';
      const capitalization = /capital|大寫|小寫/i.test(rule);
      const grammarTask = !capitalization ? 'rule_application' : /誰的|所有格|possessive/i.test(rule) ? 'possessive_title' : /代替|replac|instead of/i.test(rule) ? 'title_replacing_name' : /名字|姓名|name/i.test(rule) ? 'title_with_name' : 'capitalization_decision';
      add('grammar', rule, rule, rule, 'grammar_application', x, { evidenceType: capitalization ? 'capitalization_decision' : 'rule_application', grammarTask, grammarSource: x });
    });
    corrections.filter(x => x.lessonId === lesson.id).forEach(x => add('correction', x.correctionId, x.target, x.target + ' · ' + (x.round || x.component) + ' 訂正', x.round === 'spelling' ? 'spelling_recall' : 'correction_transfer', { prompt: x.prompt, answerStatus: x.answerStatus, originalAnswer: x.originalAnswer, gptSuggestedAnswer: x.gptSuggestedAnswer, learnerCorrection: x.learnerCorrection, round: x.round, component: x.component }, { correctionId: x.correctionId, component: x.component, sourcePrompt: x.prompt }));
    return [...items.values()];
  }
  function summarize(s) {
    s.completedCoverage = s.queue.filter(x => x.state === 'PRACTICED_RELIABLY');
    s.remainingCoverage = s.queue.filter(x => x.state !== 'PRACTICED_RELIABLY');
    s.sessionCoverage = { total: s.queue.length, practiced: s.completedCoverage.length, remaining: s.remainingCoverage.length, remainingIds: s.remainingCoverage.map(x => x.coverageId) };
    return s;
  }
  function reconcile(previous, items, identity = {}) {
    const s = previous ? clone(previous) : { ...identity, schemaVersion: '2.24.0', attempts: [], phaseProgress: PHASES.map(phaseId => ({ phaseId, status: 'not_started', notes: '' })), finalChallengeStatus: null, completed: false, osVerifiedCompleted: false };
    const old = new Map((s.queue || []).map(x => [x.coverageId, x]));
    const changed = previous && stable((s.queue || []).map(x => [x.coverageId, x.sourceVersion])) !== stable(items.map(x => [x.coverageId, x.sourceVersion]));
    s.queue = items.map(item => {
      const prior = old.get(item.coverageId);
      return prior?.sourceVersion === item.sourceVersion ? { ...prior, ...item } : { ...item, state: 'NOT_YET_PRACTICED', remainingReason: 'not_asked', validationNote: prior ? '教材或訂正已更新，舊證據不適用。' : '' };
    });
    if (changed) {
      s.completed = s.osVerifiedCompleted = false; s.finalChallengeStatus = null;
      s.phaseProgress = s.phaseProgress.map(p => p.phaseId === 'final_challenge' ? { ...p, status: 'not_started', notes: '教材更新後需重新完成 Final Challenge。' } : p);
      s.activeAttempt = null;
    }
    return summarize(s);
  }
  const words = s => text(s).toLowerCase().normalize('NFKC').match(/[a-z]+(?:['’][a-z]+)?/g) || [];
  function containsTarget(utterance, target) {
    const u = words(utterance).join(' '), t = words(target).join(' ');
    if (!t) return false;
    return (' ' + u + ' ').includes(' ' + t + ' ') || (' ' + u + ' ').includes(' ' + t + 's ') || (' ' + u + ' ').includes(' ' + t + "'s ");
  }
  function assess(item, e) {
    const fail = (remainingReason, validationNote) => ({ ok: false, remainingReason, validationNote });
    if (!e) return fail('not_asked', '尚無這項的回報。');
    if (e.sourceVersion !== item.sourceVersion) return fail('wrong_task_mode', 'sourceVersion 已過期。');
    if (!text(e.newPrompt).trim()) return fail('not_asked', '沒有實際題目。');
    if (!text(e.learnerUtterance).trim()) return fail('no_learner_response', '沒有實際回答。');
    if (!['confirmed', 'likely'].includes(e.utteranceReliability) || e.transcriptionIssue !== false) return fail('unreliable_transcript', '語音或轉錄尚未確認。');
    if (e.taskMode !== item.taskMode || !['lesson_application', 'knowledge_integration'].includes(e.phaseId)) return fail('wrong_task_mode', '任務不符，或只在暖身／Final Challenge 出現。');
    if (e.learnerFinished !== true) return fail('no_learner_response', 'Learner 尚未完成回答。');
    if (e.modelOnly !== false || e.coachSuppliedAnswer !== false) return fail('model_only', '只有示範、跟讀或 Coach 代答。');
    if (e.status !== 'practiced') return fail(REASONS.includes(e.remainingReason) ? e.remainingReason : 'no_learner_response', '尚未取得本項可靠練習證據。');
    if (!Number.isSafeInteger(e.sequence) || e.sequence < 1) return fail('wrong_task_mode', '缺少本次實際提問順序。');
    if (e.taskMode === 'vocabulary_production' || (e.taskMode === 'correction_transfer' && item.component === 'Vocabulary')) {
      if (!containsTarget(e.learnerUtterance, item.target)) return fail('coach_only_target', 'Learner 回答中沒有實際產出目標字。');
      if (words(e.learnerUtterance).length < 3 || e.newContext !== true) return fail('wrong_task_mode', '需要新情境中的句子，單獨唸字不算運用。');
    }
    if (e.taskMode === 'spelling_recall') {
      if (!/spell|letter|拼|字母/i.test(e.newPrompt) || !containsTarget(e.newPrompt,item.target)) return fail('wrong_task_mode', '沒有針對這個字的獨立拼字提問。');
      const letters = text(e.letterSequence).trim();
      if (e.utteranceReliability !== 'confirmed' || !/^[a-z](?:[\s,.-]+[a-z])+$/i.test(letters)) return fail('unreliable_transcript', '需確認分開的字母序列，不能用整個單字代替。');
      const spoken = text(e.learnerUtterance).match(/\b[a-z](?:[\s,.-]+[a-z]){1,}\b/gi) || [];
      if (!spoken.some(s => s.replace(/[^a-z]/gi, '').toLowerCase() === letters.replace(/[^a-z]/gi, '').toLowerCase())) return fail('wrong_task_mode', '字母序列沒有出現在實際回答中。');
      // A reliable but misspelled attempt counts as practice, never as mastery.
    }
    if (e.taskMode === 'grammar_application') {
      if (e.grammarRuleId !== item.coverageId) return fail('wrong_task_mode', '未對應這一條文法。');
      if (item.evidenceType === 'capitalization_decision') {
        if (!/capital|lowercase|upper.?case|大寫|小寫/i.test(e.newPrompt) || !/capital|lowercase|upper.?case|大寫|小寫/i.test(e.learnerUtterance)) return fail('wrong_task_mode', '大／小寫要有口頭選擇，不能只看自動轉錄的字形。');
        if(e.grammarTask !== item.grammarTask || !text(e.caseExample).trim() || !e.newPrompt.toLowerCase().includes(e.caseExample.toLowerCase())) return fail('wrong_task_mode','需記錄這條規則實際提問的例子與 grammarTask。');
        const title='(?:aunt|uncle|cousin|mom|mum|mother|dad|father|son|daughter|sister|brother|grandma|grandpa|grandmother|grandfather|doctor|professor|captain|president|queen|king|judge)';
        if(item.grammarTask==='possessive_title' && !new RegExp('\\b(?:my|your|his|her|our|their|its|[a-z]+[’\u0027]s)\\s+'+title+'\\b','i').test(e.caseExample)) return fail('wrong_task_mode','這項需要所有格＋稱謂的例子。');
        if(item.grammarTask==='title_with_name' && !new RegExp('\\b'+title+'\\s+[a-z]+\\b','i').test(e.caseExample)) return fail('wrong_task_mode','這項需要稱謂＋名字的例子。');
        if(item.grammarTask==='title_replacing_name' && (!new RegExp('\\b'+title+'\\b','i').test(e.caseExample) || new RegExp('\\b(?:my|your|his|her|our|their)\\s+'+title,'i').test(e.caseExample))) return fail('wrong_task_mode','這項需要稱謂代替人名的例子。');
      } else if (e.newContext !== true || !text(e.ruleApplication).trim()) return fail('wrong_task_mode', '缺少這條規則的新情境應用說明。');
    }
    if (e.taskMode === 'correction_transfer' && (e.newContext !== true || e.correctionId !== item.correctionId || !text(e.transferFocus).trim())) return fail('wrong_task_mode', '需對應這筆訂正，在新情境測試原問題。');
    return { ok: true };
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
    if (!Array.isArray(raw.coverageChecks) || !Array.isArray(raw.phaseProgress)) throw new Error('Report 需包含 coverageChecks 與 phaseProgress 陣列。');
    const allowed = new Map(s.activeAttempt.items.map(x => [x.coverageId, x.sourceVersion]));
    const warnings = [], checks = [], seen = new Set();
    for (const e of raw.coverageChecks) {
      const item = s.queue.find(x => x.coverageId === e?.coverageId);
      if (!item || allowed.get(item.coverageId) !== e.sourceVersion) { warnings.push('忽略未知、已完成或舊版本 Coverage：' + text(e?.coverageId)); continue; }
      if (seen.has(item.coverageId)) { warnings.push('同項有多筆嘗試；保留已取得的有效證據。'); }
      seen.add(item.coverageId);
      const result = assess(item, e);
      checks.push({ ...clone(e), ...result, status: result.ok ? 'practiced' : 'not_tested', label: item.label, target: item.target, kind: item.kind, lessonId: item.lessonId });
      if (result.ok) { item.state = 'PRACTICED_RELIABLY'; item.evidence = { ...clone(e), attemptId: raw.continuationAttemptId }; delete item.remainingReason; delete item.validationNote; }
      else if (item.state !== 'PRACTICED_RELIABLY') Object.assign(item, result);
    }
    summarize(s);
    const rank = { not_started: 0, partial: 1, completed: 2 };
    for (const phase of s.phaseProgress) {
      const p = raw.phaseProgress.find(x => x?.phaseId === phase.phaseId);
      if (p && rank[p.status] !== undefined && text(p.notes).trim() && rank[p.status] > rank[phase.status]) Object.assign(phase, { status: p.status, notes: p.notes });
    }
    const f = raw.finalChallenge || {};
    const currentEvidence = s.completedCoverage.filter(x => x.evidence.attemptId === raw.continuationAttemptId);
    const afterQueue = s.queue.length > 0 && !s.remainingCoverage.length && Number.isSafeInteger(f.sequence) && f.sequence > 0 && currentEvidence.every(x => x.evidence.sequence < f.sequence);
    const finalOK = afterQueue && f.learnerFinished === true && f.independentProduction === true && f.coachSuppliedAnswer === false && f.feedbackGiven === true && text(f.newPrompt).trim() && text(f.learnerUtterance).trim() && ['confirmed', 'likely'].includes(f.utteranceReliability) && f.transcriptionIssue === false;
    if (finalOK) s.finalChallengeStatus = { ...clone(f), verified: true, attemptId: raw.continuationAttemptId };
    const finalPhase = s.phaseProgress.find(x => x.phaseId === 'final_challenge');
    if (!s.finalChallengeStatus?.verified && finalPhase.status === 'completed') { finalPhase.status = 'partial'; warnings.push('Final Challenge 缺少獨立完整回答、回饋，或發生在 Coverage 補齊之前。'); }
    let endReason = raw.endReason;
    const stop = raw.stopContext || {};
    if (endReason === 'learner_agreed_stop' && (!text(stop.externalReason).trim() || /time limit|long conversation|deadline|minutes elapsed|時間到|聊太久|時間上限/i.test(stop.externalReason) || !text(stop.learnerWords).trim() || stop.coachInitiatedWrapUp !== false || /^(yes|yeah|okay|ok|thanks)[.! ]*$/i.test(stop.learnerWords.trim()))) { endReason = 'incomplete'; warnings.push('一般 Yes／Okay、時間壓力或 Coach 誘導收尾，不是有效停止同意。'); }
    if (endReason === 'learner_requested_stop' && !text(stop.learnerWords).trim()) { endReason = 'incomplete'; warnings.push('缺少 Learner 明確要求停止的原話。'); }
    s.gptClaimedCompleted = raw.completed === true;
    s.completed = s.osVerifiedCompleted = !!(s.queue.length && !s.remainingCoverage.length && s.phaseProgress.every(p => p.status === 'completed') && s.finalChallengeStatus?.verified);
    s.endReason = s.completed ? 'completed' : ['learner_requested_stop', 'learner_agreed_stop', 'technical_interruption'].includes(endReason) ? endReason : 'incomplete';
    if (s.gptClaimedCompleted && !s.completed) warnings.push('GPT 宣稱完成，但 English OS 驗證未完成；已保存有效證據。');
    const minutes = typeof raw.speakingMinutes === 'number' && Number.isFinite(raw.speakingMinutes) && raw.speakingMinutes >= 0 && ['measured', 'estimated'].includes(raw.timeBasis) ? raw.speakingMinutes : null;
    const report = { ...clone(raw), schemaVersion: raw.schemaVersion, completed: s.completed, gptClaimedCompleted: s.gptClaimedCompleted, osVerifiedCompleted: s.completed, endReason: s.endReason, phaseProgress: clone(s.phaseProgress), finalChallenge: clone(s.finalChallengeStatus || {}), coverageChecks: checks, sessionCoverage: clone(s.sessionCoverage), validationWarnings: warnings, speakingMinutes: minutes, timeBasis: minutes === null ? 'not_recorded' : raw.timeBasis, serverVerified: true };
    s.attempts.push({ id: raw.continuationAttemptId, rawReport: clone(raw), report });
    s.activeAttempt = null;
    return { state: summarize(s), report, duplicate: false };
  }
  function prepare(s, attemptId) {
    const next = clone(s);
    if (!next.activeAttempt) next.activeAttempt = { id: attemptId, items: next.remainingCoverage.map(x => ({ coverageId: x.coverageId, sourceVersion: x.sourceVersion })) };
    return next;
  }
  function publicState(s) {
    if (!s) return null;
    const { attempts, ...rest } = s;
    return { ...rest, attemptCount: attempts.length, reports: attempts.map(a => a.report) };
  }
  root.EnglishSpeakingQueue = { PHASES, REASONS, stable, version, isQueueReport, inventory, reconcile, assess, applyReport, prepare, publicState, containsTarget };
})(globalThis);
