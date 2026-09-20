# V2.26.1 IMPLEMENTATION REPORT

Version: 2.26.1  
Release focus: Evidence Lock and Final Challenge Retry Lock

## Result

V2.26.1 keeps the V2.26.0 Three-Gate Controller and closes four live-test gaps:

1. an open learner turn now produces empty Coach speech;
2. uncertain audio cannot be reconstructed into target or grammar evidence;
3. a target cannot pass unless the current reliable learner utterance contains that target or an accepted inflected form;
4. a corrected Final Challenge cannot complete without a later complete, reliable Learner Retry.

## Runtime invariants

```text
WAIT = SAY NOTHING
NO RELIABLE EVIDENCE = NO PASS
NO TARGET EVIDENCE = NO RESOLVE
CORRECTION = RETRY LOCK
NO GATE PASS = NO ADVANCE
```

The live order is TURN → HEARING → TARGET → LANGUAGE → ADVANCE. Hearing remains an evidence prerequisite rather than a new learning task.

## Server validation

- Recomputes target evidence from the reliable current-session `learnerUtterance`.
- Flags unsupported target claims as `target_evidence_mismatch`.
- Rejects Correction wording that cannot be located in the reliable learner evidence.
- Keeps unresolved corrections locked even when the Coach praised or claimed completion.
- Requires a corrected Final Challenge to include a later complete Retry with reliable transcription and valid turn order.
- Requires the Final Challenge evidence to contain 2–3 sentences and 2–3 practiced Vocabulary targets.
- Keeps Coach execution issues separate from Learner weaknesses.

## Compatibility

Vocabulary-only Required Coverage, dynamic queue length, existing runtime states, explicit Skip, Vocabulary Audit, Review Priorities, Cloud Sync, Review, Speaking duration, and prior report schemas remain supported.

## Acceptance

The dedicated V2.26.1 suite contains ten deterministic micro-tests covering true silence, uncertain hearing, missing and corrupted target evidence, real grammar correction, Retry silence, Final Challenge correction lock, “Thank you” during Retry, Final Challenge quantity, and the final audit.

No public GitHub or Vercel deployment is part of this local package.
