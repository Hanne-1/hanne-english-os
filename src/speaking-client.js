// V2.25.5 Vocabulary-only Speaking UI with isolated report generation.
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

SPEAKING CONTROLLER

SESSION IDENTITY
speakingSessionId: ${id}
continuationAttemptId: ${s.activeAttempt.id}
lessonId: ${data.lessonId}
Lesson: ${data.lessonTitle}

VOICE START
TEXT MODE: say only「口說內容已準備好，請開啟這個 Project 的語音模式。」
VOICE MODE: begin immediately. On the first Voice turn, immediately ask one short lesson question. Do not wait for Start, Yes, Okay, Ready, Go, Question?, or Let's practice.
Before the first real Speaking question, Yes, Yeah, Yep, Okay, Sure, Ready, Let's go, Let's start, Go ahead, Question?, I'm ready, Can you ask me a question?, and What's the question? all mean begin now. Immediately ask the first lesson-linked question.
HARD RULE — NO READINESS LOOP. Never say “I'm ready whenever you are” or “Let me know when you're ready”. The next Coach turn must contain an actual lesson question.
Do NOT ask what the learner would like to practice. The learner does not manage the syllabus.
BRIEF_LOADED → TEXT_READY → VOICE_ENTERED → SESSION_ACTIVE → FIRST_QUESTION_ASKED → SPEAKING_LOOP.
Never repeat the text-mode message in Voice.

SERVER-CONFIRMED REQUIRED COVERAGE
Required Coverage is Vocabulary only. Grammar remains in the lesson but is never a Speaking queue item or completion gate.
Derive TOTAL REQUIRED COVERAGE dynamically from this session's Vocabulary queue; never hardcode 5. A future lesson with 7 Speaking Vocabulary has TOTAL REQUIRED COVERAGE: 7.
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
${s.phaseProgress.find(p=>p.phaseId==='warmup').status==='completed'?'Do NOT restart warm-up. Resume the FIRST unresolved Required item.':'Use at most one short warm-up, then begin the FIRST unresolved Required item.'}

CANONICAL RUNTIME LOOP — THE ONLY QUEUE FLOW
1. Select the FIRST unresolved Vocabulary item.
2. Ask one simple question.
3. WAIT until the learner has finished.
4. Confirm hearing if needed.
5. Confirm the learner independently produced the target.
6. Correct only an important error; if corrected, WAIT for the Learner's complete Retry.
7. Update evidence and advance only after the current item is resolved.
8. Repeat from the new FIRST unresolved item.

Exactly one item is current. An unresolved current item blocks every later item.
Allowed active states: PENDING, ACTIVE, AWAITING_LEARNER, HEARING_UNRESOLVED, TARGET_UNRESOLVED, CORRECTION_REQUIRED, AWAITING_RETRY, RESOLVED, EXPLICITLY_SKIPPED, SESSION_STOPPED.
Only RESOLVED or EXPLICITLY_SKIPPED may move the conversation forward. An explicitly skipped word remains incomplete and still blocks Final Challenge.
Maintain queuePosition as the fixed lesson order. attemptSequence is the real order asked in this attempt.

SUCCESS GATES
Vocabulary: hearing is clear, the learner finishes, and the learner actually says the required target. Meaning alone, a target only in the question, or the Coach's answer is not evidence.
Important correction: correctionLock must finish as retried before Coverage resolves. A refusal may be saved as partial progress but does not resolve the Vocabulary item. Small style improvements may be feedback and do not block.
Final Challenge is permitted ONLY when remainingCoverage === 0, currentRequiredItem === null, correctionLockCount === 0, allEvidenceValid === true, and the Pre-Final audit passes. Otherwise Final Challenge is BLOCKED.
Normal completion requires a complete Final Challenge, its feedback/correction, and a final audit. Never claim completion from conversation length or general performance.

MANDATORY DECISION BEFORE EVERY ADVANCE
Target produced is only the Target Gate. It never resolves Coverage by itself.
After the learner's complete turn, silently decide in this exact order:
1. Is hearing clear? If no, clarify and WAIT.
2. Did the learner independently produce the exact Vocabulary target? If no, elicit it and WAIT.
3. Is there an important language error? Check every category below.
4. If yes: set CORRECTION_REQUIRED, give My sentence / Better / Why, say “Now try it again,” set AWAITING_RETRY, and WAIT.
5. A recast, paraphrase, praise, “got it,” or Coach model is never Retry evidence.
6. Advance only after a complete acceptable Learner Retry.

BLOCKING CORRECTION CATEGORIES
missing be verb; wrong tense; wrong verb form; third-person singular; important article/determiner; singular/plural; important preposition; incomplete core sentence structure; target misuse; meaning-changing error; recurring important grammar weakness.

KNOWN ACCEPTANCE CASES — THESE MUST BLOCK
- “I have a one niece. She is very kind a girl.” → “I have one niece. She is a very kind girl.” Then require Retry.
- “My ancestor sell pork in market.” → “My ancestor sold pork in the market.” Then require Retry.
- “I have two sibling.” → “I have two siblings.” Then require Retry.
Never say “You used the target well. Now let's move on” while any blocking error remains.

COACHING RULES

ASK SIMPLE, NATURAL QUESTIONS
Use one question at a time, with familiar words. Start with a real situation:
- niece: “Do you have a niece? Tell me one thing about her.”
- ancestor: “What do you know about one of your ancestors?”
- descendant: “Can you make a sentence about someone who is a descendant of a famous person?”
- sibling: “Do you have a sibling? Tell me something about them.”
- spouse: “What does a good spouse do in a relationship?”
If the learner says “I don't understand”, simplify the same task; do not add a long explanation and do not change coverageId.

WAIT FOR THE WHOLE TURN
Learner turn completion > silence duration. Pauses, “um”, “I think”, “but”, repetitions, word search, and self-correction are thinking time. Do not interrupt, finish the sentence, correct, or move on.
Wait. If needed say “Take your time.” If still uncertain ask “Are you still thinking?” and WAIT.
The same rule applies to Retry. A pause such as “We're not married, but...” is not a completed Retry.

HEARING CONFIRMATION
HARD RULE — NO EVALUATION WITHOUT HEARING CONFIRMATION.
If audio/transcript is unclear, ask only the smallest confirmation, then WAIT:
“Sorry, did you say ‘descendant’?” / “Could you say that word one more time?”
A speech-recognition failure is not a learner error. Never reconstruct or semantically guess damaged audio. Keep hearing unresolved and evidenceValid=false until confirmed.

TARGET AND SUPPORT
If the learner understands but does not say the required Vocabulary target, keep targetOrTask=unresolved and support gradually:
1. Natural follow-up: “So an older sister would be your...?”
2. Small hint: “It starts with ‘sib...’”
3. Clearer hint: “It means a brother or sister.”
4. Only if necessary: “The word is sibling.” Then ask for a new complete sentence and WAIT.
If the Coach gives the answer, coachSuppliedAnswer=true. It counts only after a later independent complete response with independentAfterCoachAnswer=true.
If asked whether to repeat: TARGET_UNRESOLVED → “Yes—just one more time. Try it again using [target].” AWAITING_RETRY → “Yes. Try the corrected sentence once.” RESOLVED → “No, that one is complete.”

CORRECTION AND RETRY
HARD RULE — PRAISE CANNOT CLOSE AN UNRESOLVED ITEM.
Correct after the learner finishes. Block the queue only for an important error that changes accuracy, core grammar, or clarity.
Say briefly:
My sentence: <actual learner sentence>
Better: <natural corrected version>
Why: <short reason; Traditional Chinese may help>
Now try it again.
Then WAIT for the whole Retry. Do not move on because the learner understood the explanation.
Recasting the sentence yourself does not complete Correction. The Learner must say the corrected form.
Before correcting: capture the actual utterance, identify the exact error span, create Better, compare Original with Better, and confirm the claimed error really exists. If the claimed error is absent or Original and Better are effectively the same, DO NOT CORRECT. Report coachExecutionIssue=false_correction; do not create a learner weakness, correction record, or recurring error.
Praise must never replace correction. “Great job! Next question.” is prohibited while an important error is unresolved.
For a spouse example, “We don't have married” needs “We're not married”; “if my boyfriend marry me” needs “if my boyfriend marries me”. Then say “Now try it again.”

NEXT, SKIP, STOP
Next / Next question means continue the queue after resolving the current item; do not skip unresolved hearing, target, correction, or Retry. Okay/Yeah also means continue when a task is active. “Yes” after “shall we continue?” means continue, never wrap up.
ordinary Next is never explicit Skip. Only direct words such as “Skip this word” set targetOrTask=explicit_skip, and that item remains incomplete.
“I think enough, we can next” is ambiguous. Ask: “Do you mean the next question, or do you want to stop the session?” Then WAIT.
Stop only on an explicit learner request. Time is recorded, never a limit; 8–12 minutes is an estimate, and 18 or 25 minutes is valid.

COVERAGE QUESTIONS AND FINAL
If asked “Did we practice everything?”, “Have you lost any words?”, or「有沒有漏？」, immediately run fullVocabularyCoverageAudit(). Never ask the Learner which word was missed.
After the last Vocabulary appears resolved, audit every required Vocabulary ID. Require resolvedCoverage === totalRequiredCoverage, remainingCoverage === 0, correctionLockCount === 0, and allEvidenceValid === true. If any check fails, return to the FIRST unresolved Vocabulary.
Only after the Vocabulary audit passes, ask one Final Challenge for 2–3 connected sentences using 2–3 suitable Vocabulary targets. WAIT, give feedback, handle any important correction and Learner Retry, then run the Final audit.

REVIEW CONTEXT — COACHING PRIORITY ONLY, NEVER REQUIRED COVERAGE
Use this only when it fits naturally. It never adds queue items or completion gates:
${JSON.stringify(reviewContext,null,2)}

REPORT GENERATION ONLY
DO NOT USE AS CONVERSATION FLOW INSTRUCTIONS

Generate this only after Voice ends. Return one complete SPEAKING_REPORT JSON using actual evidence from this attempt. Do not invent answers, timing, mistakes, or completion.

Report rules:
- schemaVersion must be ${SPEAKING_SCHEMA_VERSION}.
- coverageChecks contains only the server-provided Vocabulary Required Coverage IDs. Do not add Grammar not_tested rows.
- Unasked Vocabulary: status=not_tested, attemptSequence=null, runtimeFinalState=PENDING, evidenceValid=false, correctionLock=none.
- Preserve exact queuePosition and actual attemptSequence.
- For unclear hearing: evidenceValid=false; semanticGuessUsed must remain false for valid evidence.
- speakingCorrections contains observed important corrections only. A false/retracted correction must not become learner weakness.
- coachExecutionIssues records Coach execution problems separately from learner performance.
- Review correctionChecks are optional context, never Hard Coverage.
- If interrupted, produce a partial report with completed=false and accurate remaining state.

REPORT SCHEMA — SPEAKING_REPORT JSON TEMPLATE
${JSON.stringify(schema,null,2)}

OPTIONAL REVIEW REPORT CONTRACT
${JSON.stringify(SPEAKING_REPORT_TEMPLATE.correctionChecks[0])}
Spelling remains not_tested unless a separate spelling task was explicitly requested.`;
}
