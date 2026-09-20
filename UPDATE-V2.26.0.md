# V2.26.0 IMPLEMENTATION REPORT

Version: 2.26.0  
Release focus: Three-Gate Live Controller

## Result

V2.26.0 changes the live advance permission for every Vocabulary item. The Coach may resolve a word, praise, or ask the next question only after all of these facts are true:

1. the learner clearly finished the whole turn;
2. the learner independently produced the current target;
3. the completed answer passed the mandatory language scan;
4. no Retry is pending;
5. hearing is resolved.

This rule is implemented by one deterministic `canAdvanceThreeGates` guard and is used by the current-item controller and Final Challenge controller. Existing queue states, Vocabulary-only coverage, report fields, Cloud Sync, Review, and correction storage remain compatible.

## Live behavior

- Silence is the default while an answer or Retry is still open.
- Target production alone cannot complete an item.
- Every completed answer is scanned for missing be/auxiliary, tense or verb form, third-person singular, article/determiner, singular/plural, important preposition, incomplete core structure, incorrect target use, meaning-changing grammar, and known recurring important errors.
- A blocking error produces the fixed `My sentence / Better / Why / Now try it again.` response and ends the Coach turn.
- Retry runs through the same Turn, Target, and Language Gates.
- Unclear hearing stays unresolved and cannot become invented learner evidence.
- `premature_interruption` is supported as a Coach execution issue and is never converted into a learner weakness.

## Acceptance

The dedicated V2.26.0 suite contains eight micro tests:

1. article gate;
2. missing be;
3. singular/plural;
4. turn patience;
5. target missing;
6. Coach-given target;
7. Retry patience;
8. hearing uncertainty.

The release is accepted only when all eight pass together with the complete historical compatibility suite, UI checks, JavaScript syntax check, and local browser verification.

## Scope preserved

- Required Speaking Coverage remains Vocabulary only.
- Grammar and Know-how remain coaching context only.
- Existing Coverage IDs, source versions, runtime states, Report Contract, Correction records, Review, Speaking duration, and Cloud Sync behavior are retained.
- No public deployment is included in this local release package.
