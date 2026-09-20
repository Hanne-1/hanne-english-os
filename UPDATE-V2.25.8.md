# V2.25.8 IMPLEMENTATION REPORT

Version: 2.25.8

## Changed files

- `src/speaking-client.js`
- `src/speaking-queue.js`
- `src/speaking-service.mjs`
- generated `index.html`, `public/index.html`, and Supabase function copies
- `tests/v258-live-controller.test.mjs` and compatibility/UI tests
- `package.json`, `README.md`

## ROOT CAUSE

- Was V2.25.7's Live prompt too complex or overloaded? **Yes.** Its Live Controller mixed teaching actions, runtime state names, evidence fields, queue guards, audits, and report production. That made the immediate teaching choice compete with record keeping.
- Were report/state instructions competing with teaching instructions? **Yes.** The Voice Coach was asked to maintain `runtimeFinalState`, state history, sequence numbers, correction locks, and evidence fields during the conversation even though those fields are only needed after speaking.
- Was important-error detection being deprioritized by conversation continuation? **Yes, structurally.** The prompt gave conversation flow, expansion, state transitions, and correction similar visual weight. The observed failure—asking a follow-up after `I have one siblings.`—matches that priority collision. Automated tests cannot prove the model's internal cause, so this conclusion is based on prompt structure plus the reported Voice behavior.
- Did the model treat follow-up/expansion as higher priority than correction? **The reported Voice test did.** V2.25.8 therefore makes important-error correction the immediate next action after a completed answer.
- What changed? Live teaching now checks only two things: independent target production and an important error. A detected important error immediately produces the fixed four-line correction, ends with `Now try it again.`, and stops the Coach turn. Report and audit details moved to separate B/C sections.

## LIVE CONTROLLER

- V2.25.3 Live section: **3,739 tokens** (`o200k_base`)
- V2.25.7 Live section: **2,251 tokens** (`o200k_base`)
- V2.25.8 Live section: **1,076 tokens** (`o200k_base`)
- Change from V2.25.7: **1,175 fewer tokens, 52.2% shorter**
- Change from V2.25.3: **2,663 fewer tokens, 71.2% shorter**
- Removed from the Live section: repeated runtime state vocabulary, per-turn report metadata, sequence fields, queue-position bookkeeping, detailed evidence fields, and full historical correction objects.
- Core loop: ask current word → wait for complete answer → check independent target → check important error → correct and require Retry or complete word → next word.
- Compact Review Priorities remain available for question choice and recurring-error awareness. Full review objects are only in the reporting context.

## COVERAGE

- Vocabulary-only: **PASS**
- Dynamic count: **PASS** for 5, 8, and 4 Vocabulary inventories
- Grammar excluded from Required Coverage: **PASS**
- Important Grammar errors inside Vocabulary answers still trigger correction: **PASS**
- Current word stays active until learner target production, a complete answer, no important error, and any required Retry: **PASS**

## CORRECTION

- Immediate detection: **PASS**
- Retry required after every formal correction: **PASS**
- Stop after correction: **PASS**; `Now try it again.` is terminal
- False correction guard: **PASS**
- Target missing: **PASS**; Coach-supplied target does not complete the word
- Minimal correction preserving learner intent: **PASS**
- Sentence expansion waits until the blocking error is fixed: **PASS**

## MICRO TESTS

- Missing be — `My niece five years old.`: **PASS** → `My niece is five years old.` → Retry required
- Singular/plural — `I have one siblings.`: **PASS** → `I have one sibling.` → Retry required
- Target missing — descendant concept without `descendant`: **PASS** → stays on descendant; later independent complete sentence required

## FULL TEST

- niece: **PASS**; valid answer resolves without false correction
- ancestor: **PASS**; valid past-tense answer resolves
- descendant: **PASS**; concept-only answer stays on current word
- sibling: **PASS**; singular/plural correction blocks advance until successful Retry
- spouse: **PASS**; unfinished answer waits without evaluation
- Coverage audit: **PASS**; returns to first missing word
- Final Challenge: **PASS**; blocked until all Vocabulary completes
- Final Challenge Retry: **PASS**
- Completion: **PASS** only after Vocabulary and Final Challenge complete

## REPORT

- Detailed V2.25.7 evidence contract preserved: **PASS**
- `coverageId`, `sourceVersion`, queue/attempt sequence, state history, error spans, correction/Retry sequence, and runtime audit fields remain in the Report/Audit layer.
- Server validation preserved: **PASS**
- Missing Retry and missing learner-produced target cannot be inferred from Coach output: **PASS**
- Older schema compatibility preserved: **PASS**

## RESULT

- Passed: **139 core/runtime tests + 60 UI/regression tests**
- Build and inline JavaScript syntax check: **PASS**
- Local browser load: **PASS**
- Local Cloud Sync indicator: **on**
- Mobile width check at 390px: **PASS**, no horizontal overflow
- Browser console errors: **0**
- Failed automated checks: **0**
- Remaining issue: the three automated Micro Tests and full simulated flow pass, but a human ChatGPT Project Voice test is still required to confirm real Voice-model behavior. The website prepares the prompt and validates the returned report; it does not control each live Voice turn.
