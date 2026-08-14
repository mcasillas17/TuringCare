# Personalized Training and Contextual Progress Design

## Goal

Make personalized training suggestions and dog-specific skill progress core to
TuringCare's v1 value without presenting unverified behavior guidance as
professional advice.

TuringCare will turn an owner's goals, recent observations, and skill history
into one curated exercise at a time, offer an easier fallback, record how the
dog performed in the relevant context, and propose advancement for the owner to
confirm.

## Product Positioning

> TuringCare turns your dog's goals and real-world observations into one
> humane, personalized exercise at a time, tracks where each skill is reliable,
> and turns confirmed progress into a trainer-ready Behavior Brief.

The product must describe suggestions as practice from a curated curriculum,
not assessment, diagnosis, treatment, or a substitute for a qualified
professional.

## Product Strategy

Deliver the experience in three evidence-gated phases:

1. **Gate 1 — Focus-first evidence loop:** validate one useful, safe suggestion
   and contextual practice flow with the invited cohort.
2. **Gate 2 — Contextual progress:** make reliability legible, support custom
   skills, and include confirmed progress in the public-v1 Behavior Brief.
3. **Later — Coaching dashboard:** add multi-dog orchestration, richer plans,
   and broader progress views only after the focused loop proves useful.

Gate 0 correctness, privacy, email, monitoring, recovery, mobile, and
accessibility requirements remain prerequisites.

## Existing Foundation

TuringCare already has:

- owner goals;
- curated training templates and skills;
- five authored levels per catalog skill;
- owner-created skills;
- manual confidence levels from 1 through 5;
- practice sessions and milestone timestamps;
- weekly focus selection;
- progress and practice-session interfaces.

The existing catalog level descriptions already express progression across cue
support, environment, distance, duration, and distraction. The design will make
those authored targets structured and machine-readable rather than inventing a
new progression system.

The current practice-session model records time, duration, and notes but no
structured outcome or context. TuringCare therefore cannot currently make an
evidence-based reliability claim. Contextual practice evidence is the core new
input required by this design.

The current weekly-focus model is not historically versioned. Historical weeks
can display the current focus selection. This must be corrected before
personalized suggestions use weekly history.

## Gate 1: Cohort Preview

### Scope

Gate 1 supports one active catalog focus skill per dog and includes:

- historically correct weekly focus;
- structured targets derived from the catalog's five authored levels;
- one primary exercise for the active skill;
- one easier fallback;
- a plain-language reason tied to the owner's goal, recent observation, or
  practice history;
- optional structured outcome and relevant context on practice sessions;
- owner-confirmed advancement proposals;
- deterministic safety suppression and professional referral;
- usefulness, action, evidence, advancement, and safety telemetry.

The global `/my` next-action concept is absorbed into the per-dog,
per-focus-skill experience. Gate 1 does not create a separate global
recommendation engine.

Owner-created skills remain usable for manual practice and progress tracking,
but suggestions clearly state that personalized exercises are not yet available
for custom skills.

### Owner Journey

1. The owner chooses a goal and a catalog skill.
2. The owner records relevant real-world observations.
3. TuringCare shows one short exercise and explains why it fits.
4. TuringCare offers an easier version that reduces one difficulty dimension.
5. The owner practices and may record the outcome and relevant context.
6. TuringCare uses recent evidence to propose, maintain, or reduce difficulty.
7. The owner confirms or rejects any advancement proposal.
8. Safety-sensitive evidence replaces normal suggestions with referral
   guidance.

### Recommendation Contract

Recommendation inputs are:

- dog ID and owner authorization;
- active goal and catalog skill;
- current owner-confirmed level;
- structured target for that level;
- recent relevant observations;
- recent practice outcomes and contexts;
- current safety-suppression state.

Recommendation output includes:

- stable suggestion type and rule identifier;
- dog, goal, skill, and curriculum level;
- one primary exercise;
- one fallback that reduces exactly one difficulty dimension;
- a localized rationale;
- the evidence category that informed the choice;
- whether the output was suppressed for safety.

Rules are deterministic and use reviewed curriculum content. They must not infer
diagnoses, assign personality labels, or generate new exercises.

When evidence is sparse, the current curriculum level supplies a conservative
exercise. Missing data never produces invented certainty. The system may
instead ask the owner to add a goal, choose a catalog skill, or log an
observation.

Owners can skip or replace ordinary suggestions. Recommendation failures must
never block journal or practice-session saves.

### Practice Evidence

Each practice attempt may record:

- outcome: `went_well`, `mixed`, or `too_hard`;
- cue support;
- environment;
- distance;
- duration;
- distraction.

Only dimensions relevant to the selected skill are requested. Outcome remains
optional so added friction cannot cause a practice entry to be lost.

Controlled context values must preserve their meaning across curriculum
versions. Free-text notes remain supplemental and are not used by the v1
recommendation rules.

### Advancement

The system may propose advancement only from recent practice evidence against
the structured target. The proposal must show its supporting evidence.

The system never changes an owner-confirmed level automatically. The owner may:

- confirm advancement;
- stay at the current level;
- reject the proposal;
- regress to an easier level;
- state that evidence is insufficient.

Advancement proposals and confirmed milestones are separate records. Existing
milestone history remains preserved.

## Contextual Progress Model

Progress answers: **Where is this dog reliable, and what should the owner
practice next?**

For each applicable dimension, progress uses:

- **Reliable:** recent evidence supports performance in that context.
- **Developing:** evidence is mixed or below the current target.
- **Not observed:** no adequate evidence exists.

The system must never present "not observed" as failure. It must not collapse
all dimensions into a universal completion percentage or imply that a behavior
is mastered in every setting.

The existing 1–5 level remains a coarse, owner-confirmed curriculum summary.
Context evidence explains what that level means for this dog.

## Gate 2: Public v1

Public v1 adds:

- contextual reliability views showing strongest, developing, and unobserved
  contexts;
- last supporting practice date and evidence;
- owner review of advancement rationale;
- personalized suggestions for supported owner-created skills;
- contextual progress in the Behavior Brief;
- localized Briefs and transactional email;
- full professional review of curriculum targets, exercises, fallback variants,
  referral copy, and safety rules.

The catalog may remain English in public v1, while the bilingual interface,
Behavior Brief, and transactional email must match the owner's supported
language.

Custom-skill suggestions require an explicit reviewed mapping to safe exercise
content. The system must not generate suggestions from a custom skill name or
free-text note.

## Safety and Trust

### Suppression

Normal suggestions are suppressed when deterministic evidence indicates:

- aggression or bite risk;
- injury or pain;
- severe fear or panic;
- a severe recorded concern;
- sustained high-intensity, worsening behavior;
- another professionally reviewed safety condition.

Safety rules operate on explicit structured concern, severity, trend, intensity,
injury, fear, aggression, and bite-risk inputs. V1 does not scan free-text
journal or practice notes for hidden safety meaning; the capture flows must ask
owners directly for any safety-critical signal the policy depends on.

Suppression replaces the exercise and fallback rather than merely reducing
difficulty. The owner may continue journaling and recording practice but cannot
dismiss the notice to restore exercises.

### Referral

Referral guidance must work beyond the Seattle directory and may direct owners
to:

- their veterinarian for pain, injury, or medical concerns;
- a veterinary behaviorist;
- an appropriately credentialed force-free trainer or behavior consultant;
- recognized credential directories such as CCPDT, IAABC, or Fear Free.

The interface must remain calm, avoid diagnosis, and explain why normal
suggestions are unavailable.

### Review and Auditability

Before public v1, a qualified professional must review and approve the
curriculum targets, exercises, fallback rules, safety triggers, and referral
language.

The platform records:

- the deterministic rule used for each suggestion;
- the curriculum version;
- the evidence category used;
- the fallback shown;
- owner action or dismissal;
- safety suppression and referral impressions;
- advancement proposal and owner decision.

Audit records must follow TuringCare's privacy contract and must not copy
journal notes, Brief content, or other sensitive free text.

## Product Boundaries

Separate responsibilities are:

- **Curriculum:** reviewed level targets, exercises, and safe fallback variants.
- **Practice evidence:** owner-recorded outcome and relevant context.
- **Suggestion policy:** deterministic selection and explanation.
- **Safety policy:** suppression and referral independent of ordinary ranking.
- **Progress derivation:** contextual reliability from recent evidence.
- **Advancement:** proposals distinct from owner-confirmed milestones.
- **Weekly focus:** historically versioned selection used by suggestions.

These boundaries allow content, safety rules, and recommendation policy to be
reviewed and tested independently.

## Explicit Cuts

The following are outside v1:

- AI-generated recommendations or exercises;
- AI extraction from journal notes;
- chatbot guidance;
- automatic advancement;
- diagnosis or treatment recommendations;
- owner-facing universal reliability scores;
- multi-exercise daily plans;
- full multi-dog coaching orchestration;
- adaptive difficulty beyond one fallback;
- streaks, targets, badges, or gamification;
- reminders or push notifications;
- trainer accounts or reply channels;
- payments or marketplace expansion.

## Validation

### Gate 1 Acceptance

Gate 1 is not ready until:

- every suggestion has a rationale and fallback;
- historical weeks retain their own focus selection;
- every known safety fixture suppresses exercises and shows referral guidance;
- no automatic level advancement is possible;
- owner authorization protects all dog, goal, skill, session, suggestion, and
  progress data;
- cold-start catalog suggestions work without practice history;
- custom skills show an honest unsupported-suggestion state;
- journal and practice saves remain available when recommendation generation
  fails;
- deterministic rules, evidence derivation, and safety policy have focused test
  coverage.

### Cohort Success Signals

For the invited cohort:

- at least 60% of participating owners rate a suggestion useful;
- at least 40% start a displayed suggestion;
- at least 40% of practice sessions include an outcome;
- at least 70% of interviewed owners can identify their dog's weakest context
  and next practice without coaching;
- advancement confirmation and rejection are both observable;
- no dog with a known safety signal receives an exercise suggestion;
- at least three of five interviewed owners say the suggestion matched their
  dog's needs.

These are directional product signals for a small cohort, not claims of
statistical significance.

### Gate 2 Decision

Gate 2 proceeds only when:

- cohort behavior and interviews support repeat personalized practice;
- safety suppression has no known false-negative incident;
- curriculum and safety review is complete;
- contextual progress is understandable without staff explanation;
- custom-skill support uses reviewed mappings;
- localized public artifacts are ready.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Irrelevant suggestion | Explain the evidence, allow skip, collect usefulness, and offer one fallback. |
| False confidence | Distinguish not observed from developing and require owner confirmation. |
| Safety false negative | Conservative suppression, audited fixtures, and professional review. |
| Excessive capture friction | Make outcome one tap, request only relevant dimensions, and always save the session. |
| Sparse history | Use a conservative curriculum exercise without claiming reliability. |
| Personalized-advice liability | Use reviewed content, prohibit diagnosis, and state product boundaries in context. |
| Overpromising custom skills | Show an unsupported state until a reviewed mapping exists. |
| Corrupted historical advice | Version weekly focus before personalization launches. |

## Later Product Direction

After public v1 evidence supports the focused loop, TuringCare may add:

- multi-dog coaching orchestration;
- richer weekly plans;
- broader contextual trend views;
- additional professionally reviewed curriculum;
- owner preferences for practice duration, location, and equipment;
- trainer collaboration grounded in shared contextual evidence.

These additions must preserve the same deterministic, explainable, and
safety-suppressible recommendation contract unless a separately approved design
changes it.
