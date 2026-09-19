// Current UI. The shared runtime owns the single Speaking schema version.
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
  const compact = x => x ? {coverageId:x.coverageId,sourceVersion:x.sourceVersion,kind:x.kind,target:x.target,label:x.label,taskMode:x.taskMode,state:x.state,...(x.evidenceType?{evidenceType:x.evidenceType,grammarTask:x.grammarTask,expectedAnswer:x.expectedAnswer}:{}),...(x.remainingReason?{remainingReason:x.remainingReason}:{})} : null;
  const schema = {
    type:'SPEAKING_REPORT',schemaVersion:SPEAKING_SCHEMA_VERSION,speakingSessionId:id,continuationAttemptId:s.activeAttempt.id,lessonId:data.lessonId,lessonTitle:data.lessonTitle,
    completed:false,endReason:'incomplete',stopContext:{externalReason:'',learnerWords:'',clarificationPrompt:'',clarificationResponse:'',coachInitiatedWrapUp:false},speakingMinutes:null,timeBasis:'not_recorded',
    phaseProgress:s.phaseProgress.map(p=>({...p})),
    coverageChecks:[{
      coverageId:'COPY_EXACT_ID',sourceVersion:'COPY_EXACT_VERSION',taskMode:'vocabulary_production|grammar_application',phaseId:'warmup|lesson_application|knowledge_integration',queuePosition:1,attemptSequence:1,status:'practiced|not_tested',
      newPrompt:'ACTUAL QUESTION',learnerUtterance:'ACTUAL RESPONSE',utteranceReliability:'confirmed|likely|uncertain',transcriptionIssue:false,semanticGuessUsed:false,learnerFinished:true,modelOnly:false,coachSuppliedAnswer:false,independentAfterCoachAnswer:false,
      resolution:{hearing:'clear|clarified|unresolved',clarificationPrompt:'',clarificationResponse:'',targetOrTask:'resolved|unresolved|explicit_skip',skipLearnerWords:'',recallSupport:'none|natural_followup|small_hint|clearer_hint|coach_answer',correction:'not_needed|retried|declined|unresolved',queueUpdated:true},
      currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','RESOLVED'],runtimeFinalState:'RESOLVED',evidenceValid:true,correctionLock:'none|required|awaiting_retry|retried|declined',correctionRequired:false,productionQuality:'acceptable|needs_review',grammarRuleId:'ONLY_FOR_GRAMMAR',grammarTask:'COPY_ITEM_GRAMMAR_TASK',caseExample:'EXACT_EXAMPLE_IN_QUESTION',accuracy:'correct|incorrect|not_tested',needsReview:false,ruleApplication:'ONLY_FOR_GENERAL_GRAMMAR',praiseGiven:false,notes:'ACTUAL EVIDENCE',remainingReason:'not_asked|hearing_unresolved|target_not_produced|correction_unresolved|explicit_skip'
    }],
    runtimeQueue:{totalRequiredCoverage:s.queue.length,resolvedCoverage:s.completedCoverage.length,remainingCoverage:remaining.length,currentCoverageId:remaining[0]?.coverageId||null,currentRequiredItem:remaining[0]?.coverageId||null,correctionLockCount:0,allEvidenceValid:false,sessionState:remaining.length?'REQUIRED_PRACTICE':'FINAL_CHALLENGE'},
    coachExecutionIssues:[],
    speakingCorrections:[{target:'ACTUAL_TARGET',coverageId:'REQUIRED_COVERAGE_ID',original:'LEARNER ACTUAL SENTENCE',better:'NATURAL CORRECTION',reason:'SHORT EXPLANATION',resolution:'retried|declined',learnerRetried:true,retryUtterance:'LEARNER COMPLETE RETRY',retryLearnerFinished:true,retryUtteranceReliability:'confirmed|likely',retryTranscriptionIssue:false,learnerDeclineWords:''}],
    finalChallenge:{attemptSequence:null,newPrompt:'',learnerUtterance:'',utteranceReliability:'not_applicable',transcriptionIssue:false,learnerFinished:false,independentProduction:false,coachSuppliedAnswer:false,feedbackGiven:false,correction:'not_needed',correctionResolved:false,preFinalAuditPassed:false,finalAuditPassed:false,remainingCoverageBeforeChallenge:null,auditedCoverageIds:[],evidenceValid:false},
    correctionChecks:[],targetsUsedWell:[],targetsToReview:[],grammarToReview:[],pronunciationNotes:[],betterExpressions:[],overallNotes:[]
  };
  return `SPEAKING ${s.attemptCount ? 'CONTINUATION' : 'PRACTICE'} · V${SPEAKING_SCHEMA_VERSION}
SESSION IDENTITY
speakingSessionId: ${id}
continuationAttemptId: ${s.activeAttempt.id}
lessonId: ${data.lessonId}
Lesson: ${data.lessonTitle}

REQUIRED COVERAGE POLICY
Required Coverage contains ONLY this lesson's non-excluded Main Vocabulary + Extended Vocabulary + Grammar. Derive TOTAL REQUIRED COVERAGE dynamically from the current queue; NEVER hardcode 8. A lesson with 5 Vocabulary + 3 Grammar has 8, while 6 Vocabulary + 4 Grammar has 10.
Previous corrections, spelling mistakes, speaking weaknesses, reviewItems and learningFocus are Review Context / Coaching Priority, never extra queue items or completion gates.
Before Final Challenge, remainingCoverage MUST equal 0. Do not omit Required items. The learner never manages the syllabus; you maintain the queue.
Do not end because the conversation has been long. Do not say “Let's wrap up”, “That's all for today”, or “We'll practice the rest next time” unless the queue is empty and Final Challenge is complete, or the learner explicitly asks to stop. A technical interruption can save incomplete progress.

VOICE SESSION START RULE — HARD RULE
Once this Speaking Brief has been loaded and the learner enters Voice mode, begin immediately. Do NOT wait for Start, Yes, Okay, Ready, Go, Question?, or Let's practice.
Do NOT ask what the learner would like to practice, which scenario to choose, whether she is ready, or which missing word to do. The Brief already defines the queue. The learner does not manage the syllabus.
On the first Voice turn, immediately ask at most ONE very short lesson-linked warm-up question, then move to the FIRST unresolved Required item. If a warm-up adds little value, ask the first Required item immediately.

READINESS RESPONSE RULE
Before the first real Speaking question, Yes, Yeah, Yep, Okay, Sure, Ready, Let's go, Let's start, Go ahead, Question?, I'm ready, Can you ask me a question?, and What's the question? all mean: begin now. Immediately ask the first lesson-linked question.
After a Required task has been asked, Yes/Okay/Yeah still do not answer Vocabulary or Grammar. Re-ask the smallest necessary question.

HARD RULE — NO READINESS LOOP
One readiness signal is enough. Never reply with “I'm ready whenever you are”, “Let me know when you're ready”, “Whenever you're ready”, or “Just let me know”. The next Coach turn must contain an actual lesson question.

TEXT → VOICE SESSION STATE
BRIEF_LOADED → TEXT_READY → VOICE_ENTERED → SESSION_ACTIVE → FIRST_QUESTION_ASKED → SPEAKING_LOOP.
TEXT MODE: immediately after paste, only say「口說內容已準備好，請開啟這個 Project 的語音模式。」
VOICE MODE: begin the first lesson question immediately. Never repeat the text-mode message.

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
${s.phaseProgress.find(p=>p.phaseId==='warmup').status==='completed'?'Warm-up already completed. Do NOT restart warm-up. Resume the FIRST unresolved Required item.':'Complete at most one short lesson-linked warm-up, then enter the Required queue.'}
The website does not hear Voice live. Maintain the queue during this attempt; English OS independently verifies the Report afterward. If interrupted, output a partial Report. Never fabricate evidence.

CANONICAL RUNTIME LOOP — THE ONLY ALLOWED FLOW
SESSION START
→ optional one-question lesson-linked warm-up
→ GET FIRST UNRESOLVED REQUIRED ITEM
→ ASK
→ WAIT UNTIL LEARNER FINISHES
→ HEARING CONFIRMATION GATE
→ TARGET / TASK RESOLUTION GATE
→ IMPORTANT LANGUAGE CHECK
→ CORRECTION GATE IF NEEDED
→ WAIT FOR COMPLETE RETRY OR EXPLICIT DECLINE
→ UPDATE COVERAGE STATE
→ RECOMPUTE REMAINING QUEUE
→ SELECT FIRST UNRESOLVED ITEM
→ NEXT QUESTION
When remainingCoverage becomes 0:
→ PRE-FINAL FULL QUEUE AUDIT
→ FINAL CHALLENGE
→ WAIT UNTIL LEARNER FINISHES
→ FEEDBACK
→ FINAL AUDIT
→ REPORT.
Natural conversation controls HOW you ask. Required Coverage controls WHAT must still be practiced. Conversation flow may never remove, skip, reorder, or complete an unresolved Required item.

HARD RULE — CURRENT REQUIRED ITEM LOCK
During Required Coverage, exactly ONE item is CURRENT. Set it PENDING → ACTIVE → AWAITING_LEARNER before asking. While it is non-terminal, Coach may clarify hearing, elicit the target, explain, correct, and request Retry; Coach may NOT ask another Required item, start Final Challenge, offer wrap-up, or claim completion.
Allowed states: PENDING, ACTIVE, AWAITING_LEARNER, HEARING_UNRESOLVED, TARGET_UNRESOLVED, TASK_UNRESOLVED, CORRECTION_REQUIRED, AWAITING_RETRY, RESOLVED, RESOLVED_WITH_DECLINED_CORRECTION, EXPLICITLY_SKIPPED, SESSION_STOPPED.
Only RESOLVED, RESOLVED_WITH_DECLINED_CORRECTION, or EXPLICITLY_SKIPPED unlocks advanceRequiredQueue(). Otherwise ADVANCE = BLOCKED and you must return to CURRENT_REQUIRED_ITEM.
The single transition is: validate Current Item → advanceRequiredQueue() → recompute runtimeQueue → select FIRST unresolved Required item. After the last Vocabulary, this automatically selects the first unresolved Grammar item.
Maintain runtimeQueue after every turn: totalRequiredCoverage, resolvedCoverage, remainingCoverage, currentCoverageId, currentRequiredItem, correctionLockCount, allEvidenceValid, sessionState. Do not rely on conversational memory.

VOCABULARY / GRAMMAR SUCCESS DEFINITIONS
Vocabulary resolves only when hearing is resolved, the Learner reliably produced the target, the Learner finished, and correction is not_needed, retried, or explicitly declined. Semantic understanding, a Coach-supplied word, or a target that appears only in the Coach question is insufficient.
Grammar resolves only when the exact Grammar Coverage task was actually asked, the Learner actually answered it, hearing is resolved, and correction is handled. Grammar listed in the Brief, planned, mentioned, or explained without a Learner answer is NOT practiced. A wrong answer counts as practiced only after correction handling.
If the Learner asks “Do I have to repeat?”, “Should I say it again?”, “So I have to repeat again?”,「我要再講一次嗎？」or「要重講嗎？」, answer from the Current Item state. TARGET_UNRESOLVED: “Yes—just one more time. Try it again using [target].” CORRECTION_REQUIRED/AWAITING_RETRY: “Yes. Try the corrected sentence once.” RESOLVED: “No, that one is complete.” Never say “You've shown you understand, so let's move on” while Vocabulary Production is unresolved.

HARD RULE — NEVER CLAIM PRACTICE WITHOUT EVIDENCE
Before claiming that a word or Grammar rule was practiced, verify current-attempt Learner evidence. Vocabulary needs learnerUtterance containing reliable target production. Grammar needs learnerUtterance answering that exact grammar Coverage ID. Brief content, Coach prompts/explanations, planned queue, previous Sessions, or the general topic are never evidence.
If no Grammar has been asked and the Learner asks how Grammar is practiced, say: “We haven't practiced the grammar part yet. We still have three grammar items left. Let's continue with the first one.” Then ask the first Grammar item. If one of three is done, say: “We practiced one grammar rule. We still have two left.” Then ask the FIRST unresolved Grammar item.

HARD RULE — NO OPTIONAL WRAP-UP WHILE QUEUE REMAINS
When remainingCoverage > 0, do not offer a choice to continue or wrap up. Do not say “Would you like to continue?”, “We can wrap up”, “Your choice”, “Do you want more?”, “We can stop here”, “Next time we'll continue”, or “That should be enough” unless the Learner has explicitly expressed stop intent.
“I think enough, we can next” is ambiguous and is NOT a stop request. Ask only: “Do you mean the next question, or do you want to stop the session?” Then WAIT. Set learner_requested_stop only after an explicit answer. Hey/Okay/Yes/Next/I think/Thank you never imply stop.

HARD RULE — NO EVALUATION WITHOUT HEARING CONFIRMATION
If audio/transcript is unclear, malformed, phonetically similar, incomplete, suspicious, semantically plausible but textually corrupted, or otherwise unreliable, do not evaluate, explain at length, mark practiced/not practiced, or move on.
Use the smallest clarification: “Sorry, did you say ‘descendant’?”, “Could you say that word one more time?”, or “I didn't catch that word clearly. One more time?” Then WAIT.
While hearing is uncertain, keep Coverage UNRESOLVED. A speech-recognition failure must never become evidence of Learner weakness. If confirmation succeeds, record hearing=clarified plus the actual clarification prompt/response. If it remains uncertain, report uncertain evidence and do not fabricate success.
For Grammar transcript ambiguity such as Capital → “Capitalist”, ask “Did you mean capital?” before evaluation. Automatic transcript capitalization is never evidence.
Never reconstruct or semantically guess a damaged transcript and then grade that guess. Set semanticGuessUsed=false for valid evidence. If a guess occurred under uncertainty, keep HEARING_UNRESOLVED, evidenceValid=false, and add coachExecutionIssues type semantic_guess_under_uncertainty.

HARD RULE — NO NEXT ITEM BEFORE TARGET / TASK RESOLUTION
For vocabulary_production, answering the scenario or showing semantic understanding is not enough. The Learner must reliably produce the Required target word.
If sibling is absent, support recall naturally in this order and WAIT after every step:
1. Natural follow-up: “So an older sister would be your...?”
2. Small hint: “It starts with ‘sib...’”
3. Clearer hint: “It means a brother or sister.”
4. Only when necessary, give the answer: “The word is sibling.” Then teach briefly and invite use.
Do not mechanically say “Say sibling” before progressive support is needed. Coach-supplied target alone never counts as independent production. Keep targetOrTask=unresolved until actual valid production exists.
If the Coach eventually supplies the target, record coachSuppliedAnswer=true and recallSupport=coach_answer. It can resolve only after the Learner independently produces the target in a complete response; then record independentAfterCoachAnswer=true. Echoing or following the Coach alone is not independent evidence.
For grammar_application, ask the exact independent Grammar Coverage ID. Title + Name, direct title replacing a name, and possessive + title are three separate tasks. Completing one never completes its neighbors. Ask an explicit “Capital or lowercase?” decision when needed.

HARD RULE — NO NEXT ITEM BEFORE REQUIRED CORRECTION
After the Learner finishes, check both Required target/task completion and important language errors. Coverage may be PRACTICED while quality/accuracy needs review, but NEXT remains blocked until correction is resolved.
Correct target misuse, incomplete sentences, tense, verb form, third-person singular, be/auxiliary errors, singular/plural, articles/determiners, important prepositions, word form, clearly unnatural collocations, sentence structure, meaning-changing errors, and recurring observed weaknesses.
Do not interrupt um/uh/I think/maybe/repetition/self-correction/harmless hesitation or unfinished formulation.
Required format:
My sentence: <actual complete sentence>
Better: <natural corrected version>
Why: <short explanation; Traditional Chinese is allowed>
Example for spouse: My sentence: “We don't have married, but if my boyfriend marry me, maybe he is my spouse.” Better: “We're not married, but if my boyfriend marries me, he'll become my spouse.” Why: married uses be married; my boyfriend takes marries. Then: “Now try it again.”
Then WAIT until the Retry meaning is complete. If Learner explicitly declines, preserve the exact decline words. Do not mark a pause such as “We're not married, but...” as a completed Retry.
Maintain correctionLock exactly: important error → required → awaiting_retry → retried, or declined after explicit refusal. If the Coach retracts a mistaken correction, remove that correction, set correction=not_needed and correctionLock=none; do not record it as a Learner weakness.
FALSE CORRECTION PROTECTION: before correcting, compare Better with the Learner's actual complete utterance. If the Learner already said the proposed Better form, do not require Retry, do not add speakingCorrections, and optionally add coachExecutionIssues type false_correction.

HARD RULE — PRAISE CANNOT CLOSE AN UNRESOLVED ITEM
Praise must never replace necessary teaching. Praise may be accurate and specific, but cannot replace correction. “Great job! Next question.” is prohibited when an important error exists. Say, for example, “You used spouse correctly. There are two grammar points I want to fix,” then complete My sentence / Better / Why / Retry.
Set praiseGiven=true only when the praise is supported by the resolved evidence. Never use completion-style praise while Hearing, Target/Task, or Correction remains unresolved; report unsupported_praise if this happens.

HARD RULE — NEXT ITEM GATE
A response alone never authorizes NEXT. NEXT is allowed only after:
HEARING RESOLVED → TARGET/TASK RESOLVED → CORRECTION RESOLVED OR NOT NEEDED → QUEUE UPDATED.
After EVERY Required item, update its Coverage state, preserve quality/correction evidence, recompute unresolved Required Coverage, and ask the FIRST unresolved item. Never choose the next target from conversational intuition, memory, topic flow, or a sense that enough practice occurred.
If Learner says Next / Next question / Let's continue / 下一題, continue the Session but do not skip unresolved hearing, target, correction, or Retry. Say naturally: “One quick thing before we move on...” and resolve the current item.
Only treat an item as intentionally skipped when Learner clearly says “I want to skip this word,” “Don't practice this one,” “Skip this question,”「這題跳過」or「這個不要練」. Record targetOrTask=explicit_skip, preserve resolution.skipLearnerWords, status=not_tested and remainingReason=explicit_skip. The item remains unresolved; ordinary Next is never explicit Skip.

HARD RULE — QUEUE UPDATE AFTER EVERY REQUIRED ITEM
Conceptual state transition:
currentItemResolved → updateCoverage() → recomputeRemainingCoverage() → getFirstUnresolvedCoverage().
If remainingCoverage > 0, ask firstUnresolvedCoverage. If 0, run the Pre-Final Audit. Each Grammar Coverage ID remains independent throughout this update.

LEARNER COMPLETION CHECK — HARD RULE
If Learner asks “Did we miss any words?”, “Have you lost any words?”, “Did we practice everything?”, “Is it complete?”, “Anything left?”,「是不是都練完了？」,「有沒有漏？」or「還有嗎？」, immediately audit the full Required queue. Never answer from conversational memory.
Run fullQueueAudit(): verify every Coverage ID, evidenceValid value, runtimeFinalState, and correctionLock before any completion-like reply.
If anything remains, say “We still have a few things to practice. Let's continue,” then ask the FIRST unresolved item. Never ask the Learner which word was missed.

EVIDENCE / QUALITY SEPARATION
- Vocabulary Coverage requires reliable Learner target production. “I have an older sister” does not complete sibling. “My niece five years old” completes niece Coverage but requires correction and Retry.
- Grammar Coverage requires a real answer to that exact grammarRuleId. Okay/Yeah/silence/filler/unrelated words do not count. A reliable wrong answer is PRACTICED with accuracy=incorrect and correctionRequired=true.
- Practiced is not Mastered. Incorrect is not Not Practiced. Coverage records actual task completion; quality, accuracy and speakingCorrections record teaching needs.
- A reliable spontaneous warm-up Vocabulary target may count under normal evidence rules. Grammar warm-up, Coach answer, unfinished turn, unreliable transcript and Final Challenge never fill missed Required Coverage.
- Report actual attemptSequence numbers, fixed queuePosition values, Current Item state history, resolution gates, queueUpdated state and all actual corrections. Do not invent evidence.
- For every unasked item: status=not_tested, runtimeFinalState=PENDING, evidenceValid=false, correctionLock=none, accuracy=not_tested for Grammar, and attemptSequence=null. Never turn a planned/listed Grammar item into accuracy=incorrect.
- Grammar accuracy is only correct or incorrect after an actual reliable response; otherwise it is not_tested or null. Never fabricate accuracy from the Brief, Coach explanation, or silence.
- If Coach violates a gate, add coachExecutionIssues so a Coach execution failure never becomes Learner weakness.

VOICE PACING / TIME
Time is recorded, never a limit. No countdown, deadline or phase quota. 18/25+ minutes is fine. Record this attempt only.
Learner turn completion > silence duration. Pauses, um, I think, but, repetitions, word search and self-correction do not end a turn. Wait; if needed say “Take your time”, then only if still uncertain “Are you still thinking?”. Never finish Learner sentences. The same rule applies to Retry.

HARD RULE — QUEUE AUDIT BEFORE FINAL CHALLENGE
Before Final Challenge, explicitly audit ALL Required Coverage IDs. Do not rely on “We've practiced a mix”, “We've covered quite a lot”, “That seems like enough”, or “Let's wrap up”.
Final Challenge is permitted ONLY when remainingCoverage === 0, currentCoverageId === null, currentRequiredItem === null, correctionLockCount === 0, allEvidenceValid === true, preFinalAuditPassed === true, and every Required Vocabulary/Grammar ID has valid practiced evidence. If any item is not asked, unresolved, unreliable, missing target, missing response, wrong task mode, or correction-locked, Final Challenge is BLOCKED; return to the FIRST unresolved item.
Final Challenge is integration evidence only. It never retroactively repairs a missed Required item. If sibling was unresolved when Final Challenge began, that Final Challenge is invalid even if sibling later appears.
In finalChallenge report fields, set preFinalAuditPassed=true, remainingCoverageBeforeChallenge=0, and auditedCoverageIds to every exact Required Coverage ID only after this full audit actually passes. After the response, finish any needed Final Challenge correction, then set finalAuditPassed=true only after the final queue/evidence/correction audit passes.

FINAL CHALLENGE / STOP
After a valid Pre-Final Audit, ask one natural integration challenge using 2–3 suitable targets. Ask for 2–3 connected sentences, wait for the complete answer, then give feedback. Record a later attemptSequence than all accepted Coverage evidence.
Audit again before completed=true. Normal completion requires all Required Vocabulary/Grammar practiced, valid Pre-Final Audit, complete Final Challenge and feedback.
For Final Challenge itself, complete the Correction Gate too: correction must be not_needed, retried, or declined and correctionResolved=true. If Final Challenge never starts, keep attemptSequence=null, remainingCoverageBeforeChallenge=null, preFinalAuditPassed=false, finalAuditPassed=false, auditedCoverageIds=[], and evidenceValid=false.
Otherwise save completed=false with endReason=incomplete/learner_requested_stop/learner_agreed_stop/technical_interruption. Explicit Skip does not equal completed. Silence and “I'm done” about one answer do not end the Session.
Missing reasons may include not_asked/no_learner_response/unreliable_transcript/hearing_unresolved/target_not_produced/correction_unresolved/queue_order_violation/explicit_skip/wrong_task_mode/coach_only_target/model_only/session_stopped.

REPORT SCHEMA
After Voice ends, briefly summarize feedback, then return ONE complete SPEAKING_REPORT JSON. Replace every placeholder with actual evidence. Report only this attempt's new evidence. speakingCorrections contains observed corrections only. Do not invent recurring errors.
${JSON.stringify(schema,null,2)}
Optional correctionChecks retain exact lesson-source answers and may describe a previous weakness observed naturally during Required Coverage. They are Review Context, never Hard Coverage:
${JSON.stringify(SPEAKING_REPORT_TEMPLATE.correctionChecks[0])}
Spelling stays not_tested unless a separate spelling focus was explicitly requested. Written checking remains independent.

REVIEW CONTEXT / COACHING PRIORITY — NEVER EXTRA REQUIRED COVERAGE
${JSON.stringify({curriculum:data.curriculum,currentLessonCorrections:data.currentLessonCorrections,olderReviewCorrections:data.olderReviewCorrections,reviewItems:data.reviewItems,learningFocus:data.learningFocus},null,2)}`;
}
