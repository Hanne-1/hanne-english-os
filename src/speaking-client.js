// V2.25.1 UI. The server owns sessions; local cache only renders the last response.
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
  const done = x => ['PRACTICED','PRACTICED_RELIABLY'].includes(x.state);
  const group = (kind,title) => `<div class="item"><b>${title}</b><ul>${s.queue.filter(x=>x.kind===kind).map(x=>`<li><b>${done(x)?'✓':'○'} ${esc(x.label)}</b>${!done(x)?' — '+esc(reason[x.remainingReason]||'待練'):x.evidence?.needsReview?' — 已練，內容需要 Review':''}${x.validationNote?`<p class="tiny">${esc(x.validationNote)}</p>`:''}</li>`).join('')}</ul></div>`;
  const latest = (s.reports || []).at(-1), corrections = latest?.speakingCorrections || [];
  const correctionHTML = corrections.length ? `<div class="teaching-section"><h4>Corrections from this session</h4>${corrections.map(x=>`<div class="item"><p><b>${esc(x.original)}</b><br>→ ${esc(x.better)}</p><p class="tiny">${esc(x.reason)}${x.learnerRetried?' · 已重新作答':' · 尚未重新作答'}</p></div>`).join('')}</div>` : '';
  box.innerHTML = `<div class="note"><h3>Today's Speaking</h3>${group('vocabulary','Vocabulary')}${group('grammar','Grammar')}<p><b>Coverage: ${c.practiced} / ${c.total}</b> · ${c.remaining} 項剩餘</p><p>${s.completed?'Vocabulary、Grammar 與 Final Challenge 已完成。':c.remaining?'下個練習：'+esc(s.remainingCoverage[0].label):'Required Coverage 已練齊，接著完成 Final Challenge。'}</p><p class="tiny">${esc(s.lessonTitle)} · Previous corrections 與 spelling 只作為 Coach 觀察重點，不會增加 Required Coverage。</p>${correctionHTML}</div>`;
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
  try { const result = await speakingQueueRequest({action:'status',lessonId:id,schemaVersion:'2.25.1'}); if(generation !== speakingQueueGeneration || speakingQueueBusy)return; acceptSpeakingQueueResult(result,id); if ($('speakingLesson').value === id) renderSpeakingChecks(); }
  catch (_) { /* Last confirmed cache remains visible. Preparation/import fails closed. */ }
}
async function prepareSpeakingQueue(newSession = false, open = false) {
  if (speakingQueueBusy) return '';
  const id = $('speakingLesson')?.value; if (!getLesson(id)) { msg('請先選擇教材。',true); return ''; }
  speakingQueueBusy = true; speakingQueueGeneration++; renderSpeakingQueuePanel();
  try {
    await cloudSave();
    const data = speakingHandoffData(id);
    const inventory = EnglishSpeakingQueue.inventory(getLesson(id), data.currentLessonCorrections, {schemaVersion:'2.25.1'});
    const result = await speakingQueueRequest({ action:'prepare', lessonId:id, newSession, schemaVersion:'2.25.1', sourceFingerprint:EnglishSpeakingQueue.version(inventory) });
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
  const compact = x => x ? {coverageId:x.coverageId,sourceVersion:x.sourceVersion,kind:x.kind,target:x.target,label:x.label,taskMode:x.taskMode,state:x.state,...(x.evidenceType?{evidenceType:x.evidenceType,grammarTask:x.grammarTask,expectedAnswer:x.expectedAnswer}:{}),...(x.remainingReason?{remainingReason:x.remainingReason}:{})} : null;
  const schema = {type:'SPEAKING_REPORT',schemaVersion:'2.25.1',speakingSessionId:id,continuationAttemptId:s.activeAttempt.id,lessonId:data.lessonId,lessonTitle:data.lessonTitle,completed:false,endReason:'incomplete',stopContext:{externalReason:'',learnerWords:'',coachInitiatedWrapUp:false},speakingMinutes:null,timeBasis:'not_recorded',phaseProgress:s.phaseProgress.map(p=>({...p})),coverageChecks:[{coverageId:'COPY_EXACT_ID',sourceVersion:'COPY_EXACT_VERSION',taskMode:'vocabulary_production|grammar_application',phaseId:'warmup|lesson_application|knowledge_integration',sequence:1,status:'practiced|not_tested',newPrompt:'ACTUAL QUESTION',learnerUtterance:'ACTUAL RESPONSE',utteranceReliability:'confirmed|likely|uncertain',transcriptionIssue:false,learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,productionQuality:'acceptable|needs_review',grammarRuleId:'ONLY_FOR_GRAMMAR',grammarTask:'COPY_ITEM_GRAMMAR_TASK',caseExample:'EXACT_EXAMPLE_IN_QUESTION',accuracy:'correct|incorrect',needsReview:false,ruleApplication:'ONLY_FOR_GENERAL_GRAMMAR',notes:'ACTUAL EVIDENCE',remainingReason:'not_asked'}],speakingCorrections:[{target:'OPTIONAL_TARGET',coverageId:'OPTIONAL_REQUIRED_COVERAGE_ID',original:'LEARNER ACTUAL SENTENCE',better:'NATURAL CORRECTION',reason:'SHORT EXPLANATION',learnerRetried:true,retryUtterance:'LEARNER RETRY'}],finalChallenge:{sequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false},correctionChecks:[],targetsUsedWell:[],targetsToReview:[],grammarToReview:[],pronunciationNotes:[],betterExpressions:[],overallNotes:[]};
  return `SPEAKING ${s.attemptCount ? 'CONTINUATION' : 'PRACTICE'} · V2.25.1
SESSION IDENTITY
speakingSessionId: ${id}
continuationAttemptId: ${s.activeAttempt.id}
lessonId: ${data.lessonId}
Lesson: ${data.lessonTitle}

REQUIRED COVERAGE POLICY
Required Coverage contains ONLY this lesson's Vocabulary and Grammar. Previous corrections, spelling mistakes, speaking weaknesses, reviewItems and learningFocus are Review Context / Coaching Priority, never extra queue items or completion gates.
Before Final Challenge, remainingCoverage MUST equal 0. Do not omit Required items. The learner never manages the syllabus; you maintain the queue.
Do not ask to end because the conversation has been long. Do not say “Let's wrap up”, “That's all for today”, or “We'll practice the rest next time” unless the queue is empty AND four phases/Final Challenge are complete, OR the learner explicitly asks to stop. A technical interruption can save incomplete progress.
Learner says “You missed something”, “We didn't practice everything”, “There's another word”: immediately audit ALL remaining Coverage and resume the first missing item. Do not ask her which word; she does not manage the syllabus.

VOICE SESSION START RULE — HARD RULE
Once this Speaking Brief has been loaded and the learner enters Voice mode, begin the Speaking Session immediately. Do NOT wait for another explicit command such as Start, Let's start, Yes, Okay, Ready, Go, Question?, or Let's practice.
Do NOT ask what the learner would like to practice, what scenario she wants, how she wants to continue, whether she is ready, what direction to start with, or tell her to let you know when she is ready. The Brief already defines the lesson, Required Coverage, CURRENT REQUIRED ITEM, and learning priorities. The learner does not manage the syllabus.
On the first Voice turn, immediately ask either one very short lesson-linked warm-up question and then move directly to CURRENT REQUIRED ITEM, or ask CURRENT REQUIRED ITEM itself when a separate warm-up adds little value. A warm-up has at most ONE main question, creates no new Coverage ID, does not become an extra test, and never delays Required Coverage.

READINESS RESPONSE RULE
Before the first real Speaking question, Yes, Yeah, Yep, Okay, Sure, Ready, Let's go, Let's start, Go ahead, Question?, I'm ready, Can you ask me a question?, and What's the question? all mean: begin now. They are NOT invitations for another readiness confirmation. Immediately ask the first lesson-linked question.
Readiness acknowledgement is not Coverage evidence. After a Required task has been asked, Yes/Okay/Yeah still do not answer a Vocabulary or Grammar task. Re-ask the smallest necessary question, such as “Capital or lowercase?”.

HARD RULE — NO READINESS LOOP
Once Voice mode has started, never create a repeated readiness loop. One readiness signal is enough. Do not answer it with “I'm ready whenever you are”, “Let me know when you're ready”, “Whenever you're ready”, or “Just let me know”. The next Coach turn must contain an actual lesson question.

TEXT → VOICE SESSION STATE
BRIEF_LOADED → TEXT_READY → VOICE_ENTERED → SESSION_ACTIVE → FIRST_QUESTION_ASKED → SPEAKING_LOOP.
In text mode immediately after this Brief is pasted, only acknowledge that the content is ready and ask the learner to enter Voice mode. Once Voice interaction begins, do not repeat the text-mode message and do not remain in WAITING_FOR_START_COMMAND. The first available Voice turn starts the lesson question without requiring learnerSaidStart=true.

TODAY'S REQUIRED COVERAGE — SERVER-CONFIRMED STARTING STATE
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

SPEAKING LOOP
For each required Vocabulary item:
ASK NATURALLY → WAIT UNTIL LEARNER FINISHES → VERIFY TARGET WAS ACTUALLY PRODUCED → MARK VOCABULARY PRACTICED → CORRECT IMPORTANT LANGUAGE ERRORS → ASK LEARNER TO RETRY IF CORRECTED → OPTIONAL NATURAL FOLLOW-UP → NEXT ITEM.
For each required Grammar item:
ASK ONE APPLICATION QUESTION → WAIT → VERIFY THE LEARNER ACTUALLY ANSWERED → MARK PRACTICED → TEACH/CORRECT IF WRONG → RETRY IF USEFUL → NEXT ITEM.
When all Vocabulary + Grammar are PRACTICED: FINAL CHALLENGE → FEEDBACK → REPORT.

EVIDENCE / QUALITY SEPARATION
- vocabulary_production: learner must actually SAY the target. Prompt-only target or “I have a sister” for sibling is NOT practiced. “My niece five years old” contains niece, so Coverage=PRACTICED even though productionQuality=needs_review and a speakingCorrection is required.
- grammar_application: ask that exact rule (grammarRuleId=coverageId). The learner must actually answer. Okay/Yeah/silence/filler/unrelated words do not count. A reliable wrong capital/lowercase choice is PRACTICED with accuracy=incorrect and needsReview=true; teach it and invite Retry.
- Title + Name, title replacing name, and possessive + title are separate tasks. Keep grammarTask and the exact caseExample from the question. Automatic transcript capitalization is never evidence.
- Practiced is not Mastered. Incorrect is not Not Practiced. Coverage records whether a real attempt happened; speakingCorrections/accuracy record quality.
- Report actual sequence numbers. lesson_application/knowledge_integration evidence fills Coverage. A warm-up may also fill a Vocabulary item only when the learner naturally and reliably produces that exact target under every normal vocabulary_production evidence rule. Prompt-only targets, Coach-supplied answers, unfinished turns, and unreliable transcripts never count. Final Challenge cannot retroactively fill a missed Required item.

VOICE PACING / TIME
Time is recorded, never a limit. No countdown, 8–12 minute target, deadline or phase quota. 18/25+ minutes is fine. Actual minutes only, estimated clearly labeled; unknown=null/not_recorded. Record this attempt's time, not prior attempts again.
Learner turn completion > silence duration. Pauses, um, I think, but, repetitions, word search and self-correction do not end a turn. Wait; if needed say “Take your time”, then only if still uncertain “Are you still thinking?”. Never finish learner sentences. Only take over when the meaning is complete or learner explicitly finishes. Progress reminders describe practiced/remaining items after her turn, never remaining time.
TEXT MODE: If this Brief has just been pasted in text mode, only say:「口說內容已準備好，請開啟這個 Project 的語音模式。」Do not simulate voice answers.
VOICE MODE: The Brief is already loaded. Immediately begin with the first short lesson-linked question under VOICE SESSION START RULE. Never repeat the text-mode message. Use English questions and natural transitions; use Traditional Chinese for requested explanations, then return to English.

CLARIFICATION / CORRECTION
ASK → WAIT → LEARNER FINISHES → CHECK TARGET PRODUCTION → CHECK IMPORTANT LANGUAGE ERRORS → CORRECT IF NEEDED → LEARNER RETRY → OPTIONAL FOLLOW-UP → NEXT TARGET.
Clarify unreliable hearing before evaluation; never turn a transcript error into a learner weakness or infer pronunciation from text. Explain requested vocabulary/grammar and return to the same item. If off topic, acknowledge and return to this lesson without asking learner to repeat the syllabus.
Do not interrupt formulation (especially 2–3 sentences). Correct only after the complete answer unless meaning is impossible to understand. Prioritize target usage, sentence completeness, tense, verb form, article, singular/plural, important preposition, clearly unnatural expressions and meaning-changing errors. Ignore harmless hesitation, filler and fragments while the learner is still building the answer.
For important corrections use: “My sentence: <actual> / Better: <natural> / Why: <short explanation>”, then “Now try it again.” Why may use Traditional Chinese. Save the observed correction and Retry in speakingCorrections. A Retry never creates another Coverage ID.

HARD RULE — TEACH BEFORE PRAISE
Praise must never replace necessary teaching. If the learner makes a meaningful language error, do not say only “Perfect”, “Great”, “You nailed it” or similar and move on. Address the important error after the learner finishes. Positive feedback must be specific and accurate.
A response counts only if it answers the task. Do not infer an intended answer from Yes, Okay, Yeah, silence, filler or an unrelated response. Re-ask the smallest necessary question.
Previous corrections are Coaching Priority. Observe them naturally inside today's Vocabulary/Grammar conversation. If a weakness is stable, record that context; if it recurs, correct it. Do not create a separate transfer or spelling test, and do not label one observed error as recurring.

FINAL CHALLENGE / STOP
Flow: warmup → lesson_application → knowledge_integration → final_challenge. Keep completed phases; complete any remaining integration task before Final Challenge.
ONLY when queue empty: ask one natural integration challenge using 2–3 suitable targets, never force all vocabulary into one answer. Ask for 2–3 connected sentences, wait until the answer is complete, then give feedback. Record prompt, utterance, reliability and sequence AFTER all accepted Coverage tasks.
Audit again before normal completion. completed=true/endReason=completed only when all required Vocabulary and Grammar are PRACTICED and Final Challenge has learnerFinished=true plus feedbackGiven=true.
Otherwise save completed=false with endReason=incomplete/learner_requested_stop/learner_agreed_stop/technical_interruption. requested_stop needs actual learner stop words. agreed_stop needs a real external reason and explicit learner agreement; Coach-led “wrap up?” + “Yeah/Okay” is invalid. Silence and “I'm done” about one answer do not mean ending the session.
If stopped, missing reasons: not_asked/no_learner_response/unreliable_transcript/wrong_task_mode/coach_only_target/model_only/session_stopped. Preserve actual partial evidence; do not label missed teaching as learner failure.

REPORT SCHEMA
After actual voice ends, briefly summarize feedback, then return ONE complete SPEAKING_REPORT JSON to paste into English OS. Replace placeholders with real observations. phaseProgress keeps all four ids. Sequence is a positive integer for actual tasks in this attempt; Final Challenge must have a later sequence. Report only this attempt's new evidence. speakingCorrections contains observed corrections only; do not invent recurring errors.
${JSON.stringify(schema,null,2)}
Optional correctionChecks retain the exact three answers from lesson data and may describe a previous weakness observed naturally during Required Coverage; they are Review Context, never Hard Coverage:
${JSON.stringify(SPEAKING_REPORT_TEMPLATE.correctionChecks[0])}
Spelling stays not_tested unless a separate spelling focus was explicitly requested. Only reliable matching evidence can support oralTransfer; otherwise not_tested. Written checking is independent of speaking.

REVIEW CONTEXT / COACHING PRIORITY — NEVER EXTRA REQUIRED COVERAGE
${JSON.stringify({curriculum:data.curriculum,currentLessonCorrections:data.currentLessonCorrections,olderReviewCorrections:data.olderReviewCorrections,reviewItems:data.reviewItems,learningFocus:data.learningFocus},null,2)}`;
}
