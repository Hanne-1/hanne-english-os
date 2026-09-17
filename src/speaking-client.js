// V2.24 UI. The server owns sessions; local cache only renders the last response.
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
  const reason = { not_asked: '尚未提問', no_learner_response: '尚無完整回答', unreliable_transcript: '語音待確認', wrong_task_mode: '需對應的任務／新版本', coach_only_target: '回答中未產出目標字', model_only: '需自己回答', session_stopped: '停止前尚未練習' };
  box.innerHTML = `<div class="note"><h3>Speaking Coverage · 本次練習</h3><p><b>${c.practiced} / ${c.total}</b> 項已練 · <b>${c.remaining}</b> 項剩餘</p><p>${s.completed ? '全部項目、四階段與 Final Challenge 已完成。' : c.remaining ? '下個練習：' + esc(s.remainingCoverage[0].label) : '項目已練齊，接著完成剩餘階段與 Final Challenge。'}</p><p class="tiny">${esc(s.lessonTitle)} · 同一場練習可跨多次語音接續；時間只記錄，不設上限。進度在回貼 Report 後由伺服器更新。</p><details><summary>查看已練與剩餘清單</summary><ul>${s.queue.map(x => `<li><b>${x.state === 'PRACTICED_RELIABLY' ? '✓' : '○'} ${esc(x.label)}</b>${x.state !== 'PRACTICED_RELIABLY' ? ' — ' + esc(reason[x.remainingReason] || '待練') : ''}${x.validationNote ? `<p class="tiny">${esc(x.validationNote)}</p>` : ''}</li>`).join('')}</ul></details></div>`;
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
  try { const result = await speakingQueueRequest({action:'status',lessonId:id}); if(generation !== speakingQueueGeneration || speakingQueueBusy)return; acceptSpeakingQueueResult(result,id); if ($('speakingLesson').value === id) renderSpeakingChecks(); }
  catch (_) { /* Last confirmed cache remains visible. Preparation/import fails closed. */ }
}
async function prepareSpeakingQueue(newSession = false, open = false) {
  if (speakingQueueBusy) return '';
  const id = $('speakingLesson')?.value; if (!getLesson(id)) { msg('請先選擇教材。',true); return ''; }
  speakingQueueBusy = true; speakingQueueGeneration++; renderSpeakingQueuePanel();
  try {
    await cloudSave();
    const data = speakingHandoffData(id);
    const inventory = EnglishSpeakingQueue.inventory(getLesson(id), data.currentLessonCorrections);
    const result = await speakingQueueRequest({ action:'prepare', lessonId:id, newSession, sourceFingerprint:EnglishSpeakingQueue.version(inventory) });
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
  const compact = x => x ? {coverageId:x.coverageId,sourceVersion:x.sourceVersion,kind:x.kind,target:x.target,label:x.label,taskMode:x.taskMode,state:x.state,...(x.correctionId?{correctionId:x.correctionId}:{}),...(x.evidenceType?{evidenceType:x.evidenceType,grammarTask:x.grammarTask}:{}),...(x.remainingReason?{remainingReason:x.remainingReason}:{})} : null;
  const schema = {type:'SPEAKING_REPORT',schemaVersion:'2.24.0',speakingSessionId:id,continuationAttemptId:s.activeAttempt.id,lessonId:data.lessonId,lessonTitle:data.lessonTitle,completed:false,endReason:'incomplete',stopContext:{externalReason:'',learnerWords:'',coachInitiatedWrapUp:false},speakingMinutes:null,timeBasis:'not_recorded',phaseProgress:s.phaseProgress.map(p=>({...p})),coverageChecks:[{coverageId:'COPY_EXACT_ID',sourceVersion:'COPY_EXACT_VERSION',taskMode:'COPY_ITEM_TASK_MODE',phaseId:'lesson_application',sequence:1,status:'practiced',newPrompt:'ACTUAL QUESTION',learnerUtterance:'ACTUAL RESPONSE',utteranceReliability:'confirmed',transcriptionIssue:false,learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,independentProduction:false,newContext:true,grammarRuleId:'ONLY_FOR_GRAMMAR',grammarTask:'COPY_ITEM_GRAMMAR_TASK',caseExample:'EXACT_EXAMPLE_IN_QUESTION',ruleApplication:'ONLY_FOR_GENERAL_GRAMMAR',correctionId:'ONLY_FOR_CORRECTION',transferFocus:'ONLY_FOR_CORRECTION_TRANSFER',letterSequence:'ONLY_FOR_SPELLING e.g. A-N-C-E-S-T-O-R',notes:'ACTUAL EVIDENCE',remainingReason:'not_asked'}],finalChallenge:{sequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false},correctionChecks:[],targetsUsedWell:[],targetsToReview:[],grammarToReview:[],pronunciationNotes:[],betterExpressions:[],overallNotes:[]};
  return `SPEAKING ${s.attemptCount ? 'CONTINUATION' : 'PRACTICE'} · V2.24.0
SESSION IDENTITY
speakingSessionId: ${id}
continuationAttemptId: ${s.activeAttempt.id}
lessonId: ${data.lessonId}
Lesson: ${data.lessonTitle}

HARD SESSION EXECUTION RULE
You are executing an ordered Coverage Queue. Do not decide independently that enough practice has occurred.
CURRENT ITEM → ASK NATURAL QUESTION → WAIT FOR COMPLETE LEARNER RESPONSE → VERIFY EVIDENCE → MARK THAT ITEM → NEXT REQUIRED ITEM.
Before Final Challenge, remainingCoverage MUST equal 0. If > 0, continue the first remaining item. Do not omit items or merge IDs with the same target.
Do not ask to end because the conversation has been long. Do not say “Let's wrap up”, “That's all for today”, or “We'll practice the rest next time” unless the queue is empty AND four phases/Final Challenge are complete, OR the learner explicitly asks to stop. A technical interruption can save incomplete progress.
Learner says “You missed something”, “We didn't practice everything”, “There's another word”: immediately audit ALL remaining Coverage and resume the first missing item. Do not ask her which word; she does not manage the syllabus.

CURRENT COVERAGE QUEUE — SERVER-CONFIRMED STARTING STATE
TOTAL REQUIRED COVERAGE: ${s.queue.length}
CURRENT SESSION COMPLETED: ${s.completedCoverage.length}
REMAINING: ${remaining.length}
Previous coverage: ${s.completedCoverage.length} / ${s.queue.length}
CURRENT REQUIRED ITEM: ${JSON.stringify(compact(remaining[0]))}
NEXT REQUIRED ITEM: ${JSON.stringify(compact(remaining[1]))}
REMAINING QUEUE:
${JSON.stringify(remaining.map(compact),null,2)}
Completed IDs (do NOT restart these): ${JSON.stringify(s.completedCoverage.map(x=>({coverageId:x.coverageId,sourceVersion:x.sourceVersion})))}
PHASE PROGRESS: ${JSON.stringify(s.phaseProgress)}
${s.phaseProgress.find(p=>p.phaseId==='warmup').status==='completed'?'Warm-up already completed. Do NOT restart warm-up. Resume remaining Coverage directly.':'Complete a short lesson-linked warm-up, then resume the queue.'}
The website does not hear this Voice session live. Maintain only the remaining queue during this attempt; English OS independently verifies the report afterward. If interrupted, output a partial report so reliable evidence can be saved. Never fabricate evidence to pass the gate.

EVIDENCE REQUIREMENTS
- vocabulary_production: learner actually uses target in a new-context sentence. “Tell me about your spouse” → “We watch movies together” does NOT test spouse production. Prompt-only mentions do not count.
- grammar_application: ask a task for that exact rule (grammarRuleId = coverageId). Title + Name capitalization, title replacing name capitalization, possessive + title lowercase are three separate tasks. Use grammarTask from that item and put the exact example from your question in caseExample (e.g. Aunt Mary / Good morning, Mom. / my mom). Ask learner to explicitly choose capital/lowercase; automatic transcript capitalization is never evidence. Other grammar requires new-context use plus ruleApplication explaining what was tested.
- correction_transfer: a new context tests that exact correctionId/problem; record transferFocus. Saying one word does not pass all of its corrections. Model imitation alone does not count.
- spelling_recall: explicitly ask to spell, obtain confirmed individual letter sequence in learnerUtterance and letterSequence (e.g. A-N-C-E-S-T-O-R). Saying “ancestor” normally does not test spelling. If letters are uncertain, status=not_tested; do not infer spelling from an auto-assembled word.
- Separate IDs require separate matching tasks; report actual sequence numbers in this attempt. Only lesson_application/knowledge_integration evidence fills coverage. Final Challenge cannot retroactively fill missed items.
- practiced means reliable practice, not mastery or necessarily correct. Reliable wrong spelling/case choices may count as practice and need teaching. uncertain/transcriptionIssue evidence remains not_tested. Preserve earlier valid evidence even if a later model is given.

VOICE PACING / TIME
Time is recorded, never a limit. No countdown, 8–12 minute target, deadline or phase quota. 18/25+ minutes is fine. Actual minutes only, estimated clearly labeled; unknown=null/not_recorded. Record this attempt's time, not prior attempts again.
Learner turn completion > silence duration. Pauses, um, I think, but, repetitions, word search and self-correction do not end a turn. Wait; if needed say “Take your time”, then only if still uncertain “Are you still thinking?”. Never finish learner sentences. Only take over when the meaning is complete or learner explicitly finishes. Progress reminders describe practiced/remaining items after her turn, never remaining time.
If pasted in text mode, only say:「口說內容已準備好，請開啟這個 Project 的語音模式。」Do not simulate voice answers. In voice, English questions and natural transitions; Traditional Chinese for requested explanations, then return to English.

CLARIFICATION / CORRECTION
LISTEN → WAIT → VERIFY → ELICIT → EXPAND → CORRECT → RETRY → TRANSFER → RECORD.
Clarify unreliable hearing before evaluation; never turn a transcript error into a learner weakness or infer pronunciation from text. Explain requested vocabulary/grammar and return to the same item. If off topic, acknowledge and return to this lesson without asking learner to repeat the syllabus.
Do not interrupt formulation (especially 2–3 sentences). Correct only after the complete answer unless meaning is impossible to understand. Give the smallest hint first; learner explicitly asking for help can receive it. Allow her Retry and later new-context transfer. Do not treat immediate model repetition as independent transfer. No invented KPI or fluency claims from duration alone.

FINAL CHALLENGE / STOP
Flow: warmup → lesson_application → knowledge_integration → final_challenge. Keep completed phases; complete any remaining integration task before Final Challenge.
ONLY when queue empty: ask a distinct integration challenge, wait for learner's complete independent answer, then give feedback. Record prompt, utterance, reliability and sequence AFTER all accepted coverage tasks. learnerFinished=true, independentProduction=true, coachSuppliedAnswer=false, feedbackGiven=true are all required.
Audit again before normal completion. completed=true/endReason=completed only if all required items and all four phases plus final conditions are satisfied.
Otherwise save completed=false with endReason=incomplete/learner_requested_stop/learner_agreed_stop/technical_interruption. requested_stop needs actual learner stop words. agreed_stop needs a real external reason and explicit learner agreement; Coach-led “wrap up?” + “Yeah/Okay” is invalid. Silence and “I'm done” about one answer do not mean ending the session.
If stopped, missing reasons: not_asked/no_learner_response/unreliable_transcript/wrong_task_mode/coach_only_target/model_only/session_stopped. Preserve actual partial evidence; do not label missed teaching as learner failure.

REPORT SCHEMA
After actual voice ends, briefly summarize feedback, then return ONE complete SPEAKING_REPORT JSON to paste into English OS. Replace example placeholders with real observations; omit untested coverage rows or mark not_tested. phaseProgress keeps all four ids with completed/partial/not_started and notes. Sequence is a positive integer for actual tasks in this attempt; Final Challenge must have a later sequence. Report only this attempt's new evidence.
${JSON.stringify(schema,null,2)}
Optional correctionChecks retain the exact three answers from lesson data and use this schema:
${JSON.stringify(SPEAKING_REPORT_TEMPLATE.correctionChecks[0])}
Only reliable matching new-task evidence can support oralTransfer passed/needs_practice; otherwise not_tested. Written checking is independent of speaking. betterExpressions entries: {original,better,reason}; summary arrays contain strings.

CURRENT LESSON DATA — CONTEXT, NOT EXTRA REQUIRED QUEUE
${JSON.stringify({curriculum:data.curriculum,currentLessonCorrections:data.currentLessonCorrections,olderReviewCorrections:data.olderReviewCorrections,reviewItems:data.reviewItems,learningFocus:data.learningFocus},null,2)}`;
}
