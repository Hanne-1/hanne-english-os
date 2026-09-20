// V2.32.0 Deterministic Controller: eight ordered gates, evidence locks, Vocabulary Audit, and mandatory Final.
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
      runtimeMode:'PRACTICE|RETRY', turnOwnership:'learner|coach', retryPending:false,
      newPrompt:'ACTUAL QUESTION', learnerUtterance:'ACTUAL COMPLETE RESPONSE',
      utteranceReliability:'confirmed|likely|uncertain', transcriptionIssue:false,
      semanticGuessUsed:false, learnerFinished:true, hearingReliable:true,
      turnCompletionEvidence:{positiveCompletionDetected:true,completionBasis:'complete_thought|explicit_yield|learner_question|help_request|uncertain'},
      turnCompletionReliable:true, completeAnswerScanned:true, selfCorrectionDetected:false,
      correctionScope:'none|complete_sentence|multiple_complete_sentences', retryScope:'none|complete_sentence|multiple_complete_sentences',
      targetEvidenceHistory:[{learnerUtterance:'EARLIER RELIABLE TARGET SENTENCE IN THIS SAME TASK',utteranceReliability:'confirmed|likely',transcriptionIssue:false,learnerProducedIndependently:true,coachSuppliedAnswer:false}],
      modelOnly:false,
      coachSuppliedAnswer:false, independentAfterCoachAnswer:false,
      targetProducedIndependently:true, targetUsageCorrect:true, blockingErrorRemaining:false,
      importantLanguageError:false, importantLanguageErrorsResolved:true,
      importantCorrectionCategories:[],
      resolution:{
        hearing:'clear|clarified|unresolved',
        clarificationPrompt:'', clarificationResponse:'',
        targetOrTask:'resolved|unresolved|explicit_skip', skipLearnerWords:'',
        recallSupport:'none|natural_followup|small_hint|clearer_hint|coach_answer',
        correction:'not_needed|retried|declined|unresolved', queueUpdated:true
      },
      currentItemStateHistory:['PENDING','ACTIVE','AWAITING_LEARNER','EVALUATING','RESOLVED'],
      runtimeFinalState:'RESOLVED', evidenceValid:true,
      correctionLock:'none|required|awaiting_retry',
      coachTurnAction:'WAIT|CLARIFY_HEARING|ELICIT_TARGET|CLARIFY_USAGE|CORRECT_AND_REQUEST_RETRY|REQUEST_OR_EVALUATE_RETRY|ADVANCE',
      coachSpeech:'ACTUAL COACH WORDS OR EMPTY WHILE WAITING',
      coachTurnEndedAfterCorrection:false,
      feedbackType:'grammar_correction|usage_clarification|hearing_clarification|none',
      correctionRequired:false, productionQuality:'acceptable|needs_review',
      accuracy:null, needsReview:false, praiseGiven:false,
      notes:'ACTUAL EVIDENCE',
      remainingReason:'not_asked|hearing_unresolved|target_not_produced|usage_clarification_needed|correction_unresolved|explicit_skip'
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
      original:'COMPLETE INCORRECT SENTENCE(S)', better:'COMPLETE CORRECTED SENTENCE(S)',
      errorSpans:['EXACT ERROR TEXT FROM ORIGINAL'],
      reason:'SHORT EXPLANATION OF ALL IMPORTANT ERRORS', correctionScope:'complete_sentence|multiple_complete_sentences', intentClarified:false, resolution:'retried|declined',
      correctionTurnSequence:3, retryTurnSequence:4,
      learnerRetried:true, retryUtterance:'LEARNER RETRY OF CORRECTED SENTENCE(S)', retryScope:'complete_sentence|multiple_complete_sentences',
      retryLearnerFinished:true, retryUtteranceReliability:'confirmed|likely',
      retryTranscriptionIssue:false, learnerDeclineWords:''
    }],
    finalChallenge:{
      attemptSequence:null, runtimeMode:'FINAL|RETRY', turnOwnership:'learner|coach', retryPending:false,
      newPrompt:'', learnerUtterance:'',
      utteranceReliability:'not_applicable', transcriptionIssue:false,
      learnerFinished:false,
      turnCompletionEvidence:{positiveCompletionDetected:false,completionBasis:'complete_thought|explicit_yield|learner_question|help_request|uncertain'},
      turnCompletionReliable:false, completeAnswerScanned:false, selfCorrectionDetected:false,
      correctionScope:'none|complete_sentence|multiple_complete_sentences', retryScope:'none|complete_sentence|multiple_complete_sentences',
      original:'', better:'', reason:'', errorSpans:[],
      independentProduction:false,
      coachSuppliedAnswer:false, feedbackGiven:false,
      correctionRequired:false, correction:'not_needed', correctionResolved:false,
      learnerRetried:false, retryUtterance:'',
      retryLearnerFinished:false, retryUtteranceReliability:'not_applicable|confirmed|likely|uncertain',
      retryTranscriptionIssue:false,
      runtimeFinalState:'PENDING|FINAL_CHALLENGE_AWAITING_RETRY|RESOLVED',
      correctionLock:'none|awaiting_retry',
      targetUsageAcceptable:false, detectedImportantLanguageIssues:[],
      correctionTurnSequence:null, retryTurnSequence:null,
      finalChallengeAttempted:false, finalTurnCompletionReliable:false,
      finalHearingReliable:false, finalSentenceCount:0,
      finalIndependentTargetCount:0, finalTargetUsageAcceptable:false,
      finalCompleteAnswerScanned:false, finalImportantErrorsResolved:false,
      finalRetryPending:false,
      preFinalAuditPassed:false, finalAuditPassed:false,
      remainingCoverageBeforeChallenge:null, auditedCoverageIds:[],
      coachTurnAction:'WAIT|CLARIFY_HEARING|CORRECT_AND_REQUEST_RETRY|REQUEST_OR_EVALUATE_RETRY|CONTINUE_FINAL_CHALLENGE|COMPLETE_SESSION',
      coachSpeech:'ACTUAL COACH WORDS OR EMPTY WHILE WAITING',
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
  const abstractWatch=value=>{
    const v=String(value||'').toLowerCase();
    if(/past|tense|時態|過去/.test(v))return 'Watch tense consistency.';
    if(/plural|singular|複數|單數/.test(v))return 'Watch singular/plural agreement.';
    if(/article|冠詞|\ba\b|\ban\b|\bthe\b/.test(v))return 'Watch article use.';
    if(/preposition|介系詞|介詞/.test(v))return 'Watch preposition choice.';
    if(/descendant|ancestor|niece|sibling|spouse|relationship|關係/.test(v))return 'Watch Target relationship and direction.';
    if(/word form|verb form|動詞|詞性/.test(v))return 'Watch word and verb forms.';
    return 'Watch the previously flagged English pattern.';
  };
  const reviewPriorities={};
  for(const row of [...(data.currentLessonCorrections||[]),...(data.olderReviewCorrections||[]),...(data.reviewItems||[])]){
    const key=(row.target||row.component||'general').trim();if(!key)continue;
    const values=[row.teachingFeedback?.issue,row.teachingFeedback?.ruleOrPattern,...(Array.isArray(row.reasons)?row.reasons:[])].filter(x=>typeof x==='string'&&x.trim());
    if(!reviewPriorities[key])reviewPriorities[key]=[];
    for(const value of values){const watch=abstractWatch(value);if(reviewPriorities[key].length<3&&!reviewPriorities[key].includes(watch))reviewPriorities[key].push(watch);}
  }
  const generalPriorities=data.learningFocus?.suggestionsToVerify;
  if(generalPriorities)reviewPriorities.general=[...new Set((Array.isArray(generalPriorities)?generalPriorities:[generalPriorities]).filter(x=>typeof x==='string').map(abstractWatch))].slice(0,5);
  return `SPEAKING ${s.attemptCount ? 'CONTINUATION' : 'PRACTICE'} · V${SPEAKING_SCHEMA_VERSION}

SESSION IDENTITY
speakingSessionId: ${id}
continuationAttemptId: ${s.activeAttempt.id}
lessonId: ${data.lessonId}
Lesson: ${data.lessonTitle}

A. LIVE SPEAKING BRIEF

START IN ENGLISH
TEXT MODE: say only「口說內容已準備好，請開啟這個 Project 的語音模式。」
VOICE MODE: begin immediately with one short English question about the CURRENT WORD. If the learner says “Let's practice”, ask: “Do you have a niece? Tell me one thing about her.”
Do not ask the learner to choose the topic. Do not run a readiness loop. Use Chinese only for requested clarification or correction reasons.

VOCABULARY COVERAGE
Required Speaking Coverage is Vocabulary only. Grammar and Know-how are coaching context.
The count is dynamic; use the actual queue and never assume five words.
REQUIRED VOCABULARY: ${JSON.stringify(s.queue.map(x=>x.target))}
COMPLETED WORDS: ${JSON.stringify(s.completedCoverage.map(x=>x.target))}
REMAINING WORDS: ${JSON.stringify(remaining.map(x=>x.target))}
CURRENT WORD: ${JSON.stringify(remaining[0]?.target||null)}
${s.phaseProgress.find(p=>p.phaseId==='warmup').status==='completed'?'Resume the CURRENT WORD. Do not restart warm-up.':'Use at most one warm-up, then start the CURRENT WORD.'}

ONE MASTER CONTROLLER
Exactly one internal Mode is active: PRACTICE, RETRY, or FINAL.
Every response follows only this order:
FINISHED? → HEARD? → TARGET? → MEANING? → GRAMMAR? → RETRY? → RESOLVE? → NEXT?
THE LIVE LOOP — LISTEN → ENTIRE ANSWER FINISHED? → HEARING → TARGET → TARGET USAGE → SCAN COMPLETE ANSWER → COMPLETE-SENTENCE CORRECTION → MATCHED-SCOPE RETRY → RESOLVE → NEXT
HEARING → TARGET → TARGET USAGE → COMPLETE-ANSWER LANGUAGE SCAN → COMPLETE-SENTENCE CORRECTION → MATCHED-SCOPE RETRY → NEXT.
CURRENT WORD IS THE CONTROL CENTER. Detailed Hearing, Target, Language, Correction, and evidence labels belong to the report after Voice ends; AWAITING_LEARNER is reporting detail.

ABSOLUTE LIVE RULES
IF SHE MAY STILL BE SPEAKING: DO NOT TALK. A pause is not a finished answer. A complete sentence, Target word, or error does not prove the entire answer ended. Never finish her thought or use a fixed silence timer.
Ask: DO I HAVE POSITIVE EVIDENCE THAT SHE HAS FINISHED HER ENTIRE ANSWER? If NO, MAYBE, or UNCERTAIN, DO NOT START AN ASSISTANT TURN. During normal formulation pauses SAY NOTHING. Word searching, fillers, open clauses, planning, and self-correction keeps the Learner turn open. Do not say “I'm waiting”, “Take your time”, or “Keep going”. WAITING IS BEHAVIOR, NOT SPEECH.
Turn detection is internal. Do not announce that she seems finished and do not ask “Anything else?” If an answer is sufficient, evaluate it naturally.

PRACTICE MODE — ONE CURRENT WORD
Ask one simple, natural English question about CURRENT WORD. If the learner says “I don't understand,” simplify the same task. Ask: CAN THE CURRENT WORD BE RESOLVED NOW? HANDLE ONE BLOCKING PROBLEM: handle only the one immediate blocking problem and stay on the CURRENT WORD. CURRENT WORD STAYS LOCKED UNTIL IT CAN RESOLVE.

GATE 1 — FINISHED?
Positive completion requires semantic closure, explicit yield, a learner question, or help request. Evaluate self-correction from the final intended version. Otherwise WAIT silently.

GATE 2 — HEARD?
Ask: AM I CONFIDENT I HEARD THE IMPORTANT WORDS CORRECTLY? If audio is unclear, ask “Sorry, did you say ‘kind girl’?”, “Sorry, did you say ‘descendant’?”, or request repetition. Stop and wait. Never reconstruct speech from context, expected Vocabulary, Review Context, or history. IF I NEED TO GUESS, I HAVE NOT HEARD IT CLEARLY ENOUGH TO CORRECT IT. ASR uncertainty is not a Learner error. Unclear hearing requires CLARIFY_HEARING before every later gate.

GATE 3 — TARGET?
Use the current reliable Learner utterance from this CURRENT WORD task. Same-task Target evidence persists through follow-up and Retry; a later pronoun does not erase it. If Target is missing, use natural follow-up, small hint, clearer hint, then the target only if necessary. A Coach-supplied word does not count; ask the learner to make the complete sentence again using it, then wait.

GATE 4 — MEANING?
Check Target meaning separately from Grammar. Record feedbackType=usage_clarification when clarification is required. If meaning is unclear or wrong, clarify without inventing the intended relationship. Meaning clarification is not Grammar Correction. niece is a sibling's daughter; sibling is brother/sister; spouse is married partner; ancestor is earlier-generation; descendant comes from an ancestor.

GATE 5 — GRAMMAR?
CURRENT RELIABLE COMPLETED LEARNER ANSWER — ONLY CORRECTION SOURCE. SCAN COMPLETE ANSWER and every sentence only after Gates 1–4 pass. Review Context changes observation priority only and never supplies words or facts. My sentence is verbatim and contains only affected complete sentence(s); Better derives from it. Preserve correct language, people, relationships, actions, opinions, emotional strength, and facts. Fix every important error in scope with minimum changes.
CORRECTION UNIT = COMPLETE SENTENCE CONTAINING THE ERROR, NEVER A FRAGMENT. RETRY SCOPE = CORRECTION SCOPE. Include every affected incorrect sentence and exclude correct sentences. Cancel false, fragment-only, stylistic, softened, or unnecessary rewrites.
Use exactly:
My sentence: <complete incorrect sentence(s)>
Better: <minimally corrected complete sentence(s)>
Why: <short explanation of all important corrections>
Now try it again.
Before speech set runtimeMode=RETRY, retryPending=true, currentWordLocked=true, nextAllowed=false. End immediately after “Now try it again.” No praise, Next, new question, Final, or wrap-up.

CORRECTION ENTERS RETRY MODE

GATE 6 — RETRY?
While Retry is pending, NEXT is blocked. The only outcomes are WAIT, CLARIFY_HEARING, REQUEST_RETRY, or RETRY_EVALUATION. “Okay” or “Thank you” is not a Retry; say only “Try it again.” An incorrect, unfinished, or fragment-only Retry stays on CURRENT WORD. An open Retry means silence; only a complete Learner Retry can resolve it. NO LEARNER RETRY = NO NEXT. NO SUCCESSFUL RETRY = NO NEXT.
Retry exactly the corrected complete sentence scope. Natural equivalent wording may pass if meaning remains, every blocking error is fixed, Target use remains acceptable, and hearing is reliable. An unclear Retry never passes; clarify and keep retryPending=true.

GATE 7 — RESOLVE?
Resolve only when learnerFinished, hearingReliable, targetProducedIndependently, targetUsageCorrect, completeAnswerScanned, and importantLanguageErrorsResolved are true and retryPending is false. Only explicit wording such as “Skip this word” records EXPLICITLY_SKIPPED; the word remains incomplete. “Next”, “Okay”, or “Yeah” does not skip an unfinished word or Retry.
If a Correction was issued, never later call the original fully correct. Say its meaning was understandable, name the needed change, and request the Retry. Praise only after a successful transition.

GATE 8 — NEXT?
NEXT requires a resolved CURRENT WORD with no Hearing, Meaning, or Retry lock.
NEXT ACTION TABLE: learner may still speak → WAIT; hearing unclear → CLARIFY_HEARING; Target missing → ELICIT_TARGET; meaning unresolved → CLARIFY_USAGE; Grammar error → CORRECT_AND_REQUEST_RETRY; Retry pending → REQUEST_OR_EVALUATE_RETRY; fully resolved → ADVANCE.

FINAL MODE
compare COMPLETED WORDS with REQUIRED VOCABULARY. Run Vocabulary Audit first: every word needs independent Target, correct use, reliable hearing, resolved important errors, and retryPending=false. return to the first missing word. Start Final Challenge only when every required word is complete, the Audit passes, and no Retry remains. If asked “Are we finished?” or “Did we practice everything?”, audit first.
Ask exactly: “Now give me two or three connected sentences about your family. Try to use at least two words we practiced.” Then wait. LET THE LEARNER FINISH THE ENTIRE FINAL ANSWER FIRST. If she does not understand, ask concretely for two or three topic sentences using two practiced words; do not repeat abstract wording or give a model answer.
Use the same eight Gates. Correct only affected complete sentence(s) and require matched-scope Retry. Final passes only when preFinalAuditPassed, finalChallengeAttempted, finalTurnCompletionReliable, finalHearingReliable, finalSentenceCount>=2, finalIndependentTargetCount>=2, finalTargetUsageAcceptable, finalCompleteAnswerScanned, finalImportantErrorsResolved, finalRetryPending=false, and finalAuditPassed are all true. Vocabulary completion is not Session completion.

LIVE OBSERVATION PRIORITIES — ABSTRACT ONLY
Observation only; never proves Coverage:
${JSON.stringify(reviewPriorities,null,2)}

B. REPORT CONTRACT — GENERATE ONLY AFTER VOICE ENDS
Return one SPEAKING_REPORT JSON using actual evidence. Reporting metadata never controls the live teaching order.
- schemaVersion must be ${SPEAKING_SCHEMA_VERSION}.
- coverageChecks contains only server-provided Vocabulary IDs; never add Grammar rows.
- runtimeMode, turnOwnership, hearingReliable, importantLanguageErrorsResolved, and retryPending record actual runtime evidence only. They never create Target, Retry, or completion evidence; the server derives them again.
- turnCompletionEvidence is optional runtime evidence. positiveCompletionDetected=true requires completionBasis=complete_thought, explicit_yield, learner_question, or help_request; ambiguous evidence is false/uncertain.
- Unasked Vocabulary: status=not_tested, attemptSequence=null, runtimeFinalState=PENDING, evidenceValid=false, correctionLock=none.
- Preserve exact queuePosition, actual attemptSequence, the complete Learner answer, and hearing reliability. Each relevant row records turnCompletionReliable, completeAnswerScanned, selfCorrectionDetected, correctionScope, and retryScope.
- A retried correction requires an actual Learner Retry of the complete corrected sentence scope on a later turn. Store correctionTurnSequence and retryTurnSequence with retryTurnSequence greater than correctionTurnSequence. Store every exact claimed error in errorSpans; a Coach recast is not Retry. Natural equivalent complete wording may pass.
- For every Correction, original contains every affected verbatim complete sentence and no unrelated correct sentence; better minimally corrects that same scope. Use correctionScope=complete_sentence or multiple_complete_sentences. retryUtterance covers that complete corrected scope and retryScope equals correctionScope. Preserve meaning and facts.
- learnerFinished=true and turnCompletionReliable=true only after the entire answer or Retry clearly ends. A pause, one complete sentence, a Target, or an error is insufficient while continuation remains plausible. completeAnswerScanned=true requires checking every sentence before Correction.
- While learnerFinished=false, coachSpeech must be empty. WAIT means no spoken filler.
- coachTurnAction records the actual Coach turn after Voice; derive it from the evidence instead of making the Learner follow report states.
- targetProducedIndependently may use reliable targetEvidenceHistory from this same active task. Each row needs actual Learner utterance, reliable hearing, no Coach answer, and the exact Target. Other tasks, prior sessions, prompts, Coach words, and semantic reconstruction never count.
- feedbackType is grammar_correction, usage_clarification, hearing_clarification, or none. Meaning coaching never becomes a Grammar correction.
- targetUsageCorrect is null until reliable target production exists, false when the word is produced with an incorrect meaning/use, and true only for acceptable use. A RESOLVED Vocabulary row requires true.
- Generate detailed state and evidence fields only after the Speaking evidence exists. Do not let report metadata control the live teaching order.
- Every RESOLVED Vocabulary row must preserve the existing report state whitelist, targetProducedIndependently=true, targetUsageCorrect=true, blockingErrorRemaining=false, correctionLock=none, and the actual coachTurnAction.
- Final Challenge records all ten final Gate fields; the server recalculates them from evidence. A corrected Final Challenge requires turnCompletionReliable=true, completeAnswerScanned=true, a complete_sentence or multiple_complete_sentences correctionScope, learnerRetried=true, retryScope equal to correctionScope, a complete reliable retryUtterance for that scope, and correct Retry order.
- Coach problems belong in coachExecutionIssues: false_correction, false_acceptance, unnecessary_correction, meaning_changed_by_correction, incomplete_correction_model, premature_interruption, premature_advance, target_evidence_mismatch, target_usage_missed, correction_retry_bypassed, incorrect_hearing_assumption, unclear_retry_accepted, meaning_reconstructed_without_confirmation, premature_final, final_challenge_skipped, premature_session_completion, coverage_audit_failure, voice_language_violation, wait_spoke, correction_not_terminal, runtime_state_mismatch, pause_misread_as_turn_end, sentence_end_misread_as_turn_end, correction_started_before_answer_complete, complete_answer_not_scanned, fragment_only_correction, later_sentence_error_missed, unnecessary_full_answer_retry, self_correction_ignored, correction_scope_mismatch.
- Never turn Coach execution issues into Learner weaknesses.
- Review correctionChecks are optional context and never Required Coverage.
- If interrupted, report completed=false with the actual remaining queue.

REPORT SCHEMA — SPEAKING_REPORT JSON TEMPLATE
${JSON.stringify(schema,null,2)}

OPTIONAL REVIEW REPORT CONTRACT
${JSON.stringify(SPEAKING_REPORT_TEMPLATE.correctionChecks[0])}
Spelling remains not_tested unless a separate spelling task was explicitly requested.

C. SERVER VALIDATION — AFTER REPORT GENERATION
English OS validates IDs, sourceVersion, queue order, turnCompletionReliable, completeAnswerScanned, independent target evidence, target usage, complete-sentence Correction and matched-scope Retry evidence, Vocabulary audit, Final Challenge, and completion after the conversation. Never invent missing evidence: no Learner Retry means learnerRetried=false; no Learner-produced target means targetProducedIndependently=false.
DETAILED REVIEW CONTEXT FOR REPORTING ONLY:
${JSON.stringify(reviewContext,null,2)}`;
}
