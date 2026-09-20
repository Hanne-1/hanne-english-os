# V2.25.7 IMPLEMENTATION REPORT

Version: 2.25.7

Changed files:
- `src/speaking-queue.js`
- `src/speaking-client.js`
- `src/speaking-service.mjs`
- generated `index.html`, `public/index.html`, and Supabase function copies
- `tests/v257-runtime-lock.test.mjs` and compatibility tests
- `package.json`, `README.md`

## ROOT CAUSE

- Why Correction could advance without Retry: the live ChatGPT Voice turn was primarily governed by prompt instructions. The server validated the later report, but there was no deterministic one-action state selector in the shared runtime module.
- Why Coach-supplied target could count as completion: older evidence checks separated `coachSuppliedAnswer` from independent production, but the live action decision did not use a single authoritative `targetProducedIndependently` advance guard.
- Why Final Challenge opened with unresolved items: the prompt contained the audit rule, while the reusable runtime did not expose one common guard for item advance, Final Challenge entry, and completion.
- Was runtimeQueue descriptive only or actually enforced: before V2.25.7 it was mainly report-time validation plus prompt guidance. V2.25.7 adds executable state-machine guards and server-side rejection, while ChatGPT Project Voice remains a separate system without per-turn callbacks to the website.

## FIXES

- Runtime Advance Guard: added `canAdvanceCurrentItem()` with RESOLVED, hearing, independent target, learner-finished, blocking-error, correction-lock, and evidence checks.
- Correction Turn Terminal: added `terminalCorrectionText()` and one-action runtime decisions. Correction output ends exactly with `Now try it again.` and returns `endCoachTurn=true`.
- Retry Gate: added `EVALUATING_RETRY`, later-turn sequence validation, and lock clearing only after an accepted Retry.
- Independent Target Gate: Coach correction, recast, model, example, and supplied target cannot satisfy learner evidence.
- False Correction Guard: identical Original/Better or missing original error spans are rejected before learner weakness is stored.
- Final Challenge Guard: all Vocabulary must pass the same audit before entry; Final Challenge correction uses its own awaiting-retry state.
- Completion Guard: completion requires 100% valid Vocabulary evidence, no correction lock, resolved Final Challenge correction, and final audit.
- “Are we finished?” audit: returns to the first unresolved Vocabulary instead of answering from conversational memory.

## REGRESSION

- Vocabulary-only preserved: PASS
- Dynamic Coverage preserved: PASS (5, 8, and 4-word inventories tested)
- English Voice Start preserved: PASS
- Slow-turn protection preserved: PASS
- Grammar excluded from Required Coverage: PASS
- Cloud Sync, Review, Speaking Report, timer, corrected_needs_review, and Vocabulary move behavior: PASS in regression suite

## FULL 5-WORD TEST

- niece: PASS — valid sentence receives no false correction and resolves.
- ancestor: PASS — valid past-tense sentence resolves.
- descendant: PASS — missing target stays locked; Coach-supplied target does not resolve; later independent production resolves.
- sibling: PASS — minimal correction preserves intent; Correction turn stops; bad Retry stays locked; accepted Retry clears the lock.
- spouse: PASS — unfinished slow turn waits; complete independent production resolves.
- Pre-Final Audit: PASS — exact 5/5 Vocabulary and zero locks required.
- Final Challenge: PASS — blocking correction stays incomplete until a later accepted Retry.
- Final Audit: PASS — completion becomes true only after the final audit.

## RESULT

- Passed: 133 core/runtime tests, 60 UI and regression tests, JavaScript syntax/build check, local browser load, Cloud Sync visible.
- Failed: 0 automated checks.
- Remaining issues: a complete human Voice Acceptance Test is still required. Because the website only prepares content and the conversation runs in ChatGPT Project Voice, the browser runtime cannot intercept every live Voice turn. V2.25.7 now gives the Project a deterministic action contract and rejects invalid reports server-side; a fully external per-turn hard lock would require hosting the voice conversation inside English OS or adding a live tool integration.
