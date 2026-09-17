import './speaking-queue.js';
import { sourceContext } from './source-context.mjs';
const Q = globalThis.EnglishSpeakingQueue;
const text = x => typeof x === 'string' ? x : '';
// Transport-independent server boundary; required items come only from saved cloud sources.
export function createSpeakingService(store, makeId = () => crypto.randomUUID()) {
  return async function execute(input) {
    if (!['status', 'prepare', 'report'].includes(input.action)) throw new Error('未知的 Speaking 操作。');
    if (!text(input.lessonId).trim()) throw new Error('缺少 lessonId。');
    for (let retry = 0; retry < 3; retry++) {
      const snapshot = await store.source();
      const context = sourceContext(snapshot, input.lessonId);
      const items = Q.inventory(context.lesson, context.corrections);
      const fingerprint = Q.version(items);
      if (input.action === 'prepare' && input.sourceFingerprint !== fingerprint) throw new Error('雲端教材與本機尚未一致，請等 Cloud Sync 完成後再準備。');
      const row = input.action === 'report' ? await store.get(input.report?.speakingSessionId) : await store.latest(input.lessonId);
      if (row && row.lesson_id !== input.lessonId) throw new Error('Session 與教材不符。');
      if (input.action === 'report' && !row) throw new Error('找不到伺服器 Session。');
      if (!row && input.action === 'status') return { state: null, sourceFingerprint: fingerprint };
      const prior = row?.state || null;
      let s = Q.reconcile(prior, items, { speakingSessionId: 'speak_' + makeId(), lessonId: context.lesson.id, lessonTitle: context.lesson.title });
      let report = null, duplicate = false, creating = !row;
      if (input.action === 'prepare') {
        if (!items.length) throw new Error('本課目前沒有可練習項目。');
        if (input.newSession) {
          if (prior && !s.completed) throw new Error('目前這一輪尚未完成，請接續剩餘項目。');
          s = Q.reconcile(null, items, { speakingSessionId: 'speak_' + makeId(), lessonId: context.lesson.id, lessonTitle: context.lesson.title });
          creating = true;
        } else if (s.completed) return { state: Q.publicState(s), sourceFingerprint: fingerprint };
        s = Q.prepare(s, 'attempt_' + makeId());
      }
      if (input.action === 'report') {
        // Source edits invalidate stale evidence, but submitted attempts remain attributable.
        if (!s.activeAttempt && prior.activeAttempt) s.activeAttempt = prior.activeAttempt;
        const result = Q.applyReport(s, input.report);
        s = result.state; report = result.report; duplicate = result.duplicate;
        if (!duplicate) {
          const normalized = normalizeFeedback(input.report, context.corrections, report.coverageChecks);
          Object.assign(report, normalized, { importedAt: new Date().toISOString(), reportKey: input.report.continuationAttemptId });
          s.attempts[s.attempts.length - 1].report = report;
        }
      }
      if (row && Q.stable(prior) === Q.stable(s)) return { state: Q.publicState(s), report, duplicate, sourceFingerprint: fingerprint };
      if (await store.save(s, creating ? null : row.revision)) return { state: Q.publicState(s), report, duplicate, sourceFingerprint: fingerprint };
    }
    throw new Error('另一個視窗剛更新這場練習，請重新整理後再試；你的回報尚未清除。');
  };
}
function normalizeFeedback(raw, contexts, checks) {
  const warnings = [], seen = new Set();
  const correctionChecks = (Array.isArray(raw.correctionChecks) ? raw.correctionChecks : []).flatMap(c => {
    const source = contexts.find(x => x.correctionId === c?.correctionId);
    if (!source || seen.has(c.correctionId) || ['originalAnswer','gptSuggestedAnswer','learnerCorrection'].some(k => c[k] !== source[k])) { warnings.push('訂正來源不符或重複，未套用這筆能力判定。'); return []; }
    seen.add(c.correctionId);
    let writtenStatus = source.learnerCorrection !== null && text(c.reason).trim() && ['correct','needs_revision'].includes(c.writtenStatus) ? c.writtenStatus : 'not_checked';
    if (writtenStatus === 'needs_revision' && !text(c.suggestedCorrection).trim()) writtenStatus = 'not_checked';
    const evidence = checks.find(e => e.status === 'practiced' && e.correctionId === c.correctionId && e.newPrompt === c.newPrompt && e.learnerUtterance === c.learnerUtterance);
    let oralTransfer = evidence && text(c.reason).trim() && ['passed','needs_practice'].includes(c.oralTransfer) ? c.oralTransfer : 'not_tested';
    if (oralTransfer === 'passed' && evidence.independentProduction !== true) oralTransfer = 'needs_practice';
    return [{ correctionId: source.correctionId, sessionId: source.sessionId, itemId: source.itemId, lessonId: source.lessonId, component: source.component, target: source.target, contextSnapshot: {originalAnswer:source.originalAnswer,gptSuggestedAnswer:source.gptSuggestedAnswer,learnerCorrection:source.learnerCorrection}, writtenStatus, oralTransfer, newPrompt:text(c.newPrompt), learnerUtterance:text(c.learnerUtterance), utteranceReliability:evidence?.utteranceReliability || 'not_applicable', transcriptionIssue:evidence?.transcriptionIssue ?? false, reason:text(c.reason), suggestedCorrection:text(c.suggestedCorrection) }];
  });
  const result = { correctionChecks, feedbackWarnings: warnings };
  for (const key of ['targetsUsedWell','targetsToReview','grammarToReview','pronunciationNotes','overallNotes']) result[key] = (Array.isArray(raw[key]) ? raw[key] : []).filter(x => typeof x === 'string');
  result.betterExpressions = (Array.isArray(raw.betterExpressions) ? raw.betterExpressions : []).filter(x => x && typeof x === 'object').map(x => ({original:text(x.original),better:text(x.better),reason:text(x.reason)}));
  return result;
}
