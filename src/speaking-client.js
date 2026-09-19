// V2.25.6 Vocabulary Stability UI with isolated report generation.
const SPEAKING_SCHEMA_VERSION = EnglishSpeakingQueue.SCHEMA_VERSION;
var speakingQueueCache = {}, speakingQueueBusy = false, speakingQueueGeneration = 0;
const pendingSpeakingText = localStorage.getItem('hanne_speaking_pending_report_v224');
if(pendingSpeakingText && document.getElementById('speakingReport')) document.getElementById('speakingReport').value=pendingSpeakingText;
try { speakingQueueCache = JSON.parse(localStorage.getItem('hanne_speaking_queue_cache_v224') || '{}'); } catch (_) {}
function speakingCoverageHTML() { return ''; }
function speakingQueueResultHTML(report) {
  return `<div class="note"><b>${report.osVerifiedCompleted ? 'English OS 已確認完整完成' : '這場口說尚未完成 · 有效練習已保存'}</b><p>GPT 回報：${report.gptClaimedCompleted ? '完成' : '未完成'} ／ English OS 驗證：${report.osVerifiedCompleted ? '完成' : '未完成'}</p>${(report.validationWarnings || []).map(x => `<p>${esc(x)}</p>`).join('')}${(report.feedbackWarnings || []).map(x => `<p>${esc(x)}</p>`).join('')}</div>`;
}
function renderSpeakingQueuePanel() {
  const box = $('speakingQueuePanel'); if (!box) return;
  const s = speakingQueueCache[$('speakingLesson')?.value];
  $('resumeSpeakingQueue').disabled = speakingQueueBusy || !s || s.completed;
  $('newSpeakingQueue').disabled = speakingQueueBusy || !s?.completed;
  if (!s) { box.innerHTML = '<div class="note">準備口說內容後，這裡會保存本次已練與剩餘項目。語音中斷後可以接續同一場練習。</div>'; return; }
  const c = s.sessionCoverage;
  const reason = { not_asked: '尚未提問', no_learner_response: '尚無完整回答', unreliable_transcript: '語音待確認', hearing_unresolved: '需先確認聽辨', target_not_produced: '尚未可靠產出目標', correction_unresolved: '訂正／Retry 尚未完成', queue_order_violation: '不是目前第一個待完成項目', explicit_skip: '已明確跳過，仍待完成', wrong_task_mode: '需對應的任務／新版本', coach_only_target: '回答中未產出目標字', model_only: '需自己回答', session_stopped: '停止前尚未練習' };
  const done = x => ['PRACTICED','PRACTICED_RELIABLY'].includes(x.state);
  const group = (kind,title) => { const rows=s.queue.filter(x=>x.kind===kind); return rows.length?`<div class="item"><b>${title}</b><ul>${rows.map(x=>`<li><b>${done(x)?'✓':'○'} ${esc(x.label)}</b>${!done(x)?' — '+esc(reason[x.remainingReason]||'待練'):x.evidence?.needsReview?' — 已練，內容需要 Review':''}${x.validationNote?`<p class="tiny">${esc(x.validationNote)}</p>`:''}</li>`).join('')}</ul></div>`:''; };
  const latest = (s.reports || []).at(-1), corrections = latest?.speakingCorrections || [];
  const correctionHTML = corrections.length ? `<div class="teaching-section"><h4>Corrections from this session</h4>${corrections.map(x=>`<div class="item"><p><b>${esc(x.original)}</b><br>→ ${esc(x.better)}</p><p class="tiny">${esc(x.reason)}${x.learnerRetried?' · 已重新作答':' · 尚未重新作答'}</p></div>`).join('')}</div>` : '';
  box.innerHTML = `<div class="note"><h3>Today's Speaking</h3>${group('vocabulary','Vocabulary')}<p><b>Vocabulary Coverage: ${c.practiced} / ${c.total}</b> · ${c.remaining} 項剩餘</p><p>${s.completed?'Vocabulary 與 Final Challenge 已完成。':c.remaining?'下個單字：'+esc(s.remainingCoverage[0].label):'Vocabulary Coverage 已練齊，接著完成 Final Challenge。'}</p><p class="tiny">${esc(s.lessonTitle)} · Grammar、Previous corrections 與 spelling 只作為教材／Review Context，不會增加 Speaking Required Coverage。</p>${correctionHTML}</div>`;
}
async function speakingQueueRequest(input) {
  const response = await fetch(CLOUD_URL + '/functions/v1/speaking-queue', { method: 'POST', headers: { apikey: CLOUD_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok || result.error || !Object.hasOwn(result, 'state')) throw new Error(result.error || '無法連線到口說驗證服務，請稍後重試。');
  return result;
}
function acceptSpeakingQueueResult(result, lessonId) {
  if (result.state) speakingQueueCache[lessonId] = result.state; else delete speakingQueueCache[lessonId];
  localStorage.setItem('hanne_speaking_queue_cache_v224', JSON.stringify(speakingQueueCache));
  for (const report of result.state?.reports || []) persistVerifiedSpeakingReport(report);
  renderSpeakingQueuePanel();
}
function persistVerifiedSpeakingReport(report) {
  if (report.serverVerified !== true || !report.continuationAttemptId) return;
  const reports = JSON.parse(localStorage.getItem('english_os_speaking_reports') || '[]');
  if (reports.some(r => r.speakingSessionId === report.speakingSessionId && r.continuationAttemptId === report.continuationAttemptId)) return;
  reports.push(report);
  const signals = JSON.parse(localStorage.getItem('english_os_learning_signals') || '[]');
  for (const c of report.correctionChecks || []) {
    if (!(c.writtenStatus === 'needs_revision' || (c.oralTransfer === 'needs_practice' && speakingHasReliableOralEvidence(c)))) continue;
    if (signals.some(s => s.speakingReportKey === report.reportKey && s.lessonId === c.lessonId && s.target === c.target && s.component === c.component)) continue;
    signals.push({target:c.target,component:c.component,lessonId:c.lessonId,itemId:c.itemId,sessionId:c.sessionId,reason:'speaking_review',speakingReportKey:report.reportKey,at:report.importedAt});
  }
  localStorage.setItem('english_os_speaking_reports', JSON.stringify(reports));
  localStorage.setItem('english_os_learning_signals', JSON.stringify(signals));
}
async function refreshSpeakingQueue() {
  const id = $('speakingLesson')?.value, generation = speakingQueueGeneration;
  renderSpeakingQueuePanel(); if (!id || speakingQueueBusy) return;
  try { const result = await speakingQueueRequest({action:'status',lessonId:id,schemaVersion:SPEAKING_SCHEMA_VERSION}); if(generation !== speakingQueueGeneration || speakingQueueBusy)return; acceptSpeakingQueueResult(result,id); if ($('speakingLesson').value === id) renderSpeakingChecks(); }
  catch (_) { /* Last confirmed cache remains visible. Preparation/import fails closed. */ }
}
async function prepareSpeakingQueue(newSession = false, open = false) {
  if (speakingQueueBusy) return '';
  const id = $('speakingLesson')?.value; if (!getLesson(id)) { msg('請先選擇教材。',true); return ''; }
  speakingQueueBusy = true; speakingQueueGeneration++; renderSpeakingQueuePanel();
  try {
    await cloudSave();
    const data = speakingHandoffData(id);
    const inventory = EnglishSpeakingQueue.inventory(getLesson(id), data.currentLessonCorrections, {schemaVersion:SPEAKING_SCHEMA_VERSION});
    const result = await speakingQueueRequest({ action:'prepare', lessonId:id, newSession, schemaVersion:SPEAKING_SCHEMA_VERSION, sourceFingerprint:EnglishSpeakingQueue.version(inventory) });
    acceptSpeakingQueueResult(result,id);
    if (result.state.completed) { msg('這一輪已完成；按「完成後開始新一輪」可再次練習。'); return ''; }
    const text = formatSpeakingBrief(data, result.state.speakingSessionId, result.state);
    speakingBriefDraft = {id:result.state.speakingSessionId,attemptId:result.state.activeAttempt.id,text};
    if ($('speakingLesson').value === id) { $('speakingBrief').value = text; if (open) $('speakingContentPreview').open = true; }
    return text;
  } catch(e) { msg(e.message,true); return ''; }
  finally { speakingQueueBusy = false; renderSpeakingQueuePanel(); }
}
function buildSpeakingBriefText() { return speakingBriefDraft?.text || ''; }
async function copySpeakingQueue() {
  const text = await prepareSpeakingQueue(); if (!text) return;
  try { await navigator.clipboard.writeText(text); msg('已複製，請貼到 ChatGPT Project，再開啟語音模式。'); }
  catch (_) { $('speakingContentPreview').open = true; msg('請在展開的內容中手動全選複製。',true); }
}
async function importQueueReport(text) {
  if (speakingQueueBusy) return null;
  const box = $('speakingImportResult'); box.classList.add('show');
  localStorage.setItem('hanne_speaking_pending_report_v224',text);
  speakingQueueBusy = true; speakingQueueGeneration++; renderSpeakingQueuePanel();
  try {
    const raw = parseSpeakingReport(text); await cloudSave();
    const result = await speakingQueueRequest({action:'report',lessonId:raw.lessonId,report:raw});
    acceptSpeakingQueueResult(result,raw.lessonId);
    $('speakingLesson').value = raw.lessonId; speakingBriefDraft = null; $('speakingBrief').value = '';
    localStorage.removeItem('hanne_speaking_pending_report_v224');
    box.textContent = result.state.completed ? '✓ English OS 已確認完整完成。' : `已保存有效練習：${result.state.sessionCoverage.practiced} / ${result.state.sessionCoverage.total} 項，剩餘 ${result.state.sessionCoverage.remaining} 項。請按「接續未完成練習」。`;
    if (result.report?.gptClaimedCompleted && !result.report.osVerifiedCompleted) box.textContent += ' GPT 雖回報完成，但 English OS 驗證尚未完成。';
    renderSpeakingChecks();renderSpeakingContextSummary();renderSpeakingQueuePanel();renderReview();
    return result.report;
  } catch(e) { box.textContent = '尚未匯入：' + e.message + ' 原回報已保留，請重試。'; msg(box.textContent,true); return null; }
  finally { speakingQueueBusy = false;renderSpeakingQueuePanel(); }
}
function formatSpeakingBrief(data, id, s) {
  if (!s?.activeAttempt) throw new Error('請先由伺服器準備口說 Session。');
  const remaining = s.remainingCoverage;
  const compact = x => x ? {
    coverageId:x.coverageId, sourceVersion:x.sourceVersion, kind:x.kind,
    target:x.target, label:x.label, taskMode:x.taskMode, state:x.state,
    ...(x.remainingReason ? {remainingReason:x.remainingReason} : {})
  } : null;
  const schema = {
    type:'SPEAKING_REPORT', schemaVersion:SPEAKING_SCHEMA_VERSION,
    speakingSessionId:id, continuationAttemptId:s.activeAttempt.id,
    lessonId:data.lessonId, lessonTitle:data.lessonTitle,
    completed:false, endReason:'incomplete',
    stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},
    speakingMinutes:null, timeBasis:'not_recorded',
    phaseProgress:s.phaseProgress.map(p=>({...p})),
    coverageChecks:[{
      coverageId:'COPY_EXACT_ID', sourceVersion:'COPY_EXACT_VERSION',
      taskMode:'vocabulary_production',
      phaseId:'warmup|lesson_application|knowledge_integration',
      queuePosition:1, attemptSequence:1, status:'practiced|not_tested',
      newPrompt:'ACTUAL QUESTION', learnerUtterance:'ACTUAL COMPLETE RESPONSE',
      utteranceReliability:'confirmed|likely|uncertain', transcriptionIssue:false,
      semanticGuessUsed:false, learnerFinished:true, modelOnly:false,
      coachSuppliedAnswer:false, independentAfterCoachAnswer:false,
      importantLanguageError:false,
      importantCorrectionCategories:[],
      resolution:{
        hearing:'clear|clarified|unresolved',
        clarificationPrompt:'', clarificationResponse:'',
        targetOrTask:'resolved|unresolved|explicit_skip', skipLearnerWords:'',
        recallSupport:'none|natural_followup|small_hint|clearer_hint|coach_answer',
        correction:'not_needed|retried|declined|unresolved', queueUpdated:true
      },
      currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','RESOLVED'],
      runtimeFinalState:'RESOLVED', evidenceValid:true,
      correctionLock:'none|required|awaiting_retry|retried|declined',
      correctionRequired:false, productionQuality:'acceptable|needs_review',
      accuracy:null, needsReview:false, praiseGiven:false,
      notes:'ACTUAL EVIDENCE',
      remainingReason:'not_asked|hearing_unresolved|target_not_produced|correction_unresolved|explicit_skip'
    }],
    runtimeQueue:{
      totalRequiredCoverage:s.queue.length,
      resolvedCoverage:s.completedCoverage.length,
      remainingCoverage:remaining.length,
      currentCoverageId:remaining[0]?.coverageId||null,
      currentRequiredItem:remaining[0]?.coverageId||null,
      correctionLockCount:0,
      allEvidenceValid:false,
      sessionState:remaining.length?'REQUIRED_PRACTICE':'FINAL_CHALLENGE'
    },
    coachExecutionIssues:[],
    speakingCorrections:[{
      target:'ACTUAL_TARGET', coverageId:'REQUIRED_COVERAGE_ID',
      original:'LEARNER ACTUAL SENTENCE', better:'NATURAL CORRECTION',
      errorSpans:['EXACT ERROR TEXT FROM ORIGINAL'],
      reason:'SHORT EXPLANATION', resolution:'retried|declined',
      learnerRetried:true, retryUtterance:'LEARNER COMPLETE RETRY',
      retryLearnerFinished:true, retryUtteranceReliability:'confirmed|likely',
      retryTranscriptionIssue:false, learnerDeclineWords:''
    }],
    finalChallenge:{
      attemptSequence:null, newPrompt:'', learnerUtterance:'',
      utteranceReliability:'not_applicable', transcriptionIssue:false,
      learnerFinished:false, independentProduction:false,
      coachSuppliedAnswer:false, feedbackGiven:false,
      correction:'not_needed', correctionResolved:false,
      preFinalAuditPassed:false, finalAuditPassed:false,
      remainingCoverageBeforeChallenge:null, auditedCoverageIds:[],
      evidenceValid:false
    },
    correctionChecks:[], targetsUsedWell:[], targetsToReview:[],
    grammarToReview:[], pronunciationNotes:[], betterExpressions:[], overallNotes:[]
  };
  const compactCorrection = c => ({
    correctionId:c.correctionId,target:c.target,round:c.round,
    originalAnswer:c.originalAnswer,gptSuggestedAnswer:c.gptSuggestedAnswer,
    learnerCorrection:c.learnerCorrection,correctionStatus:c.correctionStatus,
    teachingFeedback:c.teachingFeedback ? {
      issue:c.teachingFeedback.issue,
      ruleOrPattern:c.teachingFeedback.ruleOrPattern
    } : null
  });
  const reviewContext = {
    currentLessonCorrections:(data.currentLessonCorrections||[]).map(compactCorrection),
    olderReviewCorrections:(data.olderReviewCorrections||[]).map(compactCorrection),
    reviewItems:(data.reviewItems||[]).map(x=>({target:x.target,component:x.component,reasons:x.reasons})),
    speakingPriorities:data.learningFocus?.suggestionsToVerify||null
  };
  return `SPEAKING ${s.attemptCount ? 'CONTINUATION' : 'PRACTICE'} · V${SPEAKING_SCHEMA_VERSION}

SESSION IDENTITY
speakingSessionId: ${id}
continuationAttemptId: ${s.activeAttempt.id}
lessonId: ${data.lessonId}
Lesson: ${data.lessonTitle}

A. LIVE SPEAKING CONTROLLER

LANGUAGE AND VOICE START
Use English for every Speaking question. Traditional Chinese is allowed only when the learner asks for it, or for a short clarification / correction reason. Never begin a Vocabulary task in Chinese.
TEXT MODE: say only「口說內容已準備好，請開啟這個 Project 的語音模式。」
VOICE MODE: begin immediately. On the first Voice turn, immediately ask one short English lesson question. Never repeat the text-mode message in Voice.
If the learner says “Let's practice”, ask: “Do you have a niece? Tell me one thing about her.”
Before the first real Speaking question, Yes, Yeah, Yep, Okay, Sure, Ready, Let's go, Let's start, Go ahead, Question?, I'm ready, Can you ask me a question?, and What's the question? all mean begin now.
HARD RULE — NO READINESS LOOP. Never say “I'm ready whenever you are” or “Let me know when you're ready”. The next Coach turn must contain an actual lesson question.
Do NOT ask what the learner would like to practice. The learner does not manage the syllabus.
BRIEF_LOADED → TEXT_READY → VOICE_ENTERED → SESSION_ACTIVE → FIRST_QUESTION_ASKED → SPEAKING_LOOP.

SERVER-CONFIRMED VOCABULARY COVERAGE
Required Speaking Coverage is selected Vocabulary only. Grammar and Know-how remain Review Context and never become Speaking queue items or completion gates.
Derive TOTAL REQUIRED COVERAGE dynamically from the queue; never hardcode 5. A lesson with 8 selected Vocabulary has TOTAL REQUIRED COVERAGE: 8.
TOTAL REQUIRED COVERAGE: ${s.queue.length}
CURRENT SESSION COMPLETED: ${s.completedCoverage.length}
REMAINING: ${remaining.length}
CURRENT REQUIRED ITEM: ${JSON.stringify(compact(remaining[0]))}
NEXT REQUIRED ITEM: ${JSON.stringify(compact(remaining[1]))}
REMAINING QUEUE:
${JSON.stringify(remaining.map(compact),null,2)}
COMPLETED IDs — do not restart:
${JSON.stringify(s.completedCoverage.map(x=>({coverageId:x.coverageId,sourceVersion:x.sourceVersion})))}
PHASE PROGRESS: ${JSON.stringify(s.phaseProgress)}
${s.phaseProgress.find(p=>p.phaseId==='warmup').status==='completed'?'Do NOT restart warm-up. Resume the FIRST unresolved Vocabulary.':'Use at most one short warm-up, then begin the FIRST unresolved Vocabulary.'}

PRIMARY VOCABULARY LOOP — HIGHEST PRIORITY
1. Select the FIRST unresolved Vocabulary. Exactly one currentRequiredItem is active.
2. Ask one simple English question, then WAIT for the complete learner turn.
3. If hearing is uncertain, clarify minimally and WAIT. Do not evaluate yet.
4. Confirm the Learner independently said the target. If not, elicit the same target and WAIT.
5. Check the complete answer once for all important errors.
6. If correction is needed, give one concise correction, request one Learner Retry, and WAIT.
7. Resolve only after hearing, independent target production, learner completion, and an acceptable Retry when required.
8. Only then advance to the next Vocabulary.

NO RESOLVE → NO NEXT.
CORRECTION → LEARNER RETRY → WAIT.
Conversation length, understanding, praise, Okay, Yeah, Next, a target in the Coach question, a Coach answer, or a Coach recast never bypasses this loop.

TURN, HEARING, AND TARGET
Learner turn completion is more important than silence duration. Pauses, “um”, “I think”, “maybe”, “because”, “but”, repetition, self-correction, word search, short silence, and “We're not married, but...” can mean the learner is still speaking. Do not interrupt or finish the sentence. Say “Take your time.” if useful; if still uncertain ask “Are you still thinking?” and WAIT. Apply the same rule to Retry.
HARD RULE — NO EVALUATION WITHOUT HEARING CONFIRMATION. If audio is unclear, ask only “Sorry, did you say ‘descendant’?” or “Could you say that word one more time?” and WAIT. A speech recognition failure is not a learner error. Never reconstruct or semantically guess damaged audio.
The Learner must actually say the Vocabulary target. Meaning, a synonym, “yes”, or a Coach-produced target is not production. Keep targetOrTask=unresolved.
Support in this order: natural follow-up → small hint → clearer hint → Coach answer. Example: “So an older sister would be your...?” → “It starts with ‘sib...’” → “It means a brother or sister.” → “The word is sibling.”
If the Coach gives the target, set coachSuppliedAnswer=true. Ask for a new complete answer and WAIT; resolve only after independentAfterCoachAnswer=true.
ASK SIMPLE, NATURAL QUESTIONS. If the learner says “I don't understand”, simplify the same task without changing coverageId.

IMPORTANT CORRECTION AND RETRY
Blocking categories only: missing be / auxiliary; wrong tense or verb form; third-person singular; important article / determiner; singular / plural; important preposition; incomplete core sentence; target misuse; meaning-changing error; recurring important weakness. Save small style improvements for feedback.
Target produced does not resolve an item while a blocking error remains. Inspect the whole completed answer and combine all blocking fixes into one concise Better sentence.
Use exactly:
My sentence: <actual complete learner sentence>
Better: <one corrected sentence covering all important errors>
Why: <short explanation; Traditional Chinese only if helpful>
Now try it again.
Then WAIT for the whole Retry and stop the Coach turn. A recast, model, Okay, I understand, Yeah, or Got it is not Learner Retry.
If the Retry still has any blocking error, keep AWAITING_RETRY, correct only what remains, request another Retry, and WAIT. Advance only when retryLearnerFinished=true and retryAcceptable=true.
HARD RULE — PRAISE CANNOT CLOSE AN UNRESOLVED ITEM. “Great job! Next question.” is prohibited before resolution.
Before correction, capture the actual utterance, identify every exact error span, compare Original with Better, and confirm each claimed error exists. If a claimed span is absent or Original and Better are effectively the same: DO NOT CORRECT; record coachExecutionIssue=false_correction only. Do not create a learner weakness or recurring error.

NEXT, SKIP, AND STOP
Next / Next question / Let's continue / Okay / Yeah means continue only after the current item resolves; do not skip unresolved hearing, target, correction, or Retry. “Yes” after “shall we continue?” means continue, never wrap up.
ordinary Next is never explicit Skip. Only “Skip this word” sets EXPLICITLY_SKIPPED. A skipped Vocabulary remains incomplete and blocks Final Challenge and session completion.
Stop only on an explicit learner request. Time is recorded, never a limit.

VOCABULARY AUDIT AND FINAL CHALLENGE
If asked “Did we practice everything?”, “Have you lost any words?”, or「有沒有漏？」, immediately run fullVocabularyCoverageAudit(). Never ask the Learner which word was missed.
Final Challenge is permitted ONLY when resolvedCoverage === totalRequiredCoverage, remainingCoverage === 0, currentRequiredItem === null, correctionLockCount === 0, allEvidenceValid === true, and the pre-Final audit passes. Otherwise return to the FIRST unresolved Vocabulary.
Final Challenge is Vocabulary integration only: ask for 2–3 connected sentences using 2–3 suitable practiced targets. It cannot supply missing Coverage. If a blocking error appears, use the same Correction → Learner Retry → WAIT loop. Final Challenge completes only after its Retry, feedback, and final audit pass.

REVIEW CONTEXT — COACHING PRIORITY ONLY
Use prior Vocabulary weaknesses naturally for question choice, difficulty, and recurring-error observation. Never create an extra Grammar question or Required Coverage item from Review Context.
${JSON.stringify(reviewContext,null,2)}

B. REPORT GENERATION — ONLY AFTER VOICE ENDS
Return one SPEAKING_REPORT JSON using actual evidence. Reporting metadata never controls the live teaching order.
- schemaVersion must be ${SPEAKING_SCHEMA_VERSION}.
- coverageChecks contains only server-provided Vocabulary IDs; never add Grammar rows.
- Unasked Vocabulary: status=not_tested, attemptSequence=null, runtimeFinalState=PENDING, evidenceValid=false, correctionLock=none.
- Preserve exact queuePosition, actual attemptSequence, complete learner utterances, and hearing reliability.
- A retried correction requires an actual complete Learner Retry. Store every exact claimed error in errorSpans; a Coach recast is not Retry.
- Coach problems belong in coachExecutionIssues: false_correction, premature advance, correction_retry_bypassed, incorrect_hearing_assumption, premature_session_completion, coverage_audit_failure, voice_language_violation.
- Never turn Coach execution issues into Learner weaknesses.
- Review correctionChecks are optional context and never Required Coverage.
- If interrupted, report completed=false with the actual remaining queue.

REPORT SCHEMA — SPEAKING_REPORT JSON TEMPLATE
${JSON.stringify(schema,null,2)}

OPTIONAL REVIEW REPORT CONTRACT
${JSON.stringify(SPEAKING_REPORT_TEMPLATE.correctionChecks[0])}
Spelling remains not_tested unless a separate spelling task was explicitly requested.`;
}
