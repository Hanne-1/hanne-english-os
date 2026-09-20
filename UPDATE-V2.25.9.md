# V2.25.9 IMPLEMENTATION REPORT

Version: 2.25.9

## Scope

V2.25.9 is a targeted update on V2.25.8. It does not redesign the Live Controller, Vocabulary queue, Final Challenge, phases, or core Report schema. It changes turn patience, whole-answer evaluation, hearing reliability, and Retry reliability.

## Changed files

- `src/speaking-client.js`
- `src/speaking-queue.js`
- `src/speaking-service.mjs`
- generated `index.html`, `public/index.html`, and Supabase function copies
- `tests/v259-turn-patience.test.mjs` and compatibility/UI tests
- `package.json`, `README.md`

## ROOT CAUSE

V2.25.8 correctly said that a pause is not a finished answer, but the Live instructions still placed target detection and correction close to the first apparently complete sentence. It also allowed `Take your time.` whenever useful without stating that silence is preferred. In Voice practice, that left room for the Coach to treat a pause or a grammatically complete first sentence as the end of the turn.

V2.25.9 makes learner turn completion the first decision. Target checks, error detection, correction, praise, follow-up, and the next question all wait until the whole answer is clearly finished.

## LIVE CONTROLLER

- V2.25.8 Live section: **1,076 tokens** (`o200k_base`)
- V2.25.9 Live section: **1,400 tokens** (`o200k_base`)
- Added: **324 tokens** for explicit turn-patience and whole-answer rules
- V2.25.9 remains **37.8% shorter than V2.25.7** (2,251 tokens)
- Report/Audit separation remains unchanged.
- No new runtime state was added.

New priority:

1. Do not interrupt.
2. Wait until the learner clearly finishes the whole answer.
3. Check target production.
4. Check important errors across the whole answer.
5. Correct and require Retry if needed.
6. Continue only after the current word and Retry are complete.

## TURN PATIENCE

- Thinking silence is not turn completion: **PASS**
- Incomplete trailing structures are definitely unfinished: **PASS**
- A complete first sentence still receives continuation space: **PASS**
- Silence is preferred over routine `Take your time.` interruptions: **PASS**
- Target-missing evaluation waits for the full turn: **PASS**
- Correction waits for the full answer and scans it once: **PASS**
- Retry uses the same patience rule: **PASS**

## HEARING RELIABILITY

- No semantic reconstruction: **PASS**
- Implausible ASR is never accepted as PASS: **PASS**
- Unclear audio requires confirmation before target/error evaluation: **PASS**
- Server rejects a clearly incomplete trailing structure even if the report claims `learnerFinished=true`: **PASS**

## CORRECTION / RETRY

- V2.25.8 immediate correction remains active after whole-answer completion: **PASS**
- Missing be detection: **PASS**
- Singular/plural detection: **PASS**
- Correction turn remains terminal at `Now try it again.`: **PASS**
- An unfinished Retry stays correction-locked: **PASS**
- Full corrected sentence is preferred; abnormal or uncertain Retry audio requires hearing confirmation: **PASS**

## ACCEPTANCE GATE

- TEST 1 — Interrupted multi-pause answer: **PASS**
- TEST 2 — Complete sentence followed by another sentence: **PASS**
- TEST 3 — Multi-pause Retry: **PASS**
- TEST 4 — Missing be correction: **PASS**
- TEST 5 — Singular/plural correction: **PASS**
- TEST 6 — ASR uncertainty confirmation: **PASS**

Result: **6 / 6 PASS**

## REGRESSION

- Vocabulary-only Coverage: **PASS**
- Dynamic Vocabulary count: **PASS**
- Current Word lock: **PASS**
- Final Challenge gate: **PASS**
- Detailed Report and server validation: **PASS**
- Older report compatibility: **PASS**
- Cloud Sync, Review, corrected_needs_review, learning timer, and Vocabulary movement regression checks: **PASS**

## RESULT

- Core/runtime tests: **148 / 148 PASS**
- UI/regression tests: **60 / 60 PASS**
- Build and inline JavaScript syntax check: **PASS**
- Automated failures: **0**
- Remaining issue: a human ChatGPT Project Voice test is still required because English OS prepares the prompt and validates the returned report but does not control each live Voice turn.
