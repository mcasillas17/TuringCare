# Canine behavior research → deterministic program engine

> **Authoritative spec: [ENGINE-SPEC.md](ENGINE-SPEC.md).** The deep-read digests supersede the NOTES where they
> conflict: [01](01-learning-theory/DIGEST.md), [02a](02-problem-behaviors/DIGEST-a.md),
> [02b](02-problem-behaviors/DIGEST-b.md), [03](03-development-life-stages/DIGEST.md),
> [04](04-individual-differences/DIGEST.md), [05](05-professional-standards-curricula/DIGEST.md),
> [06](06-life-skills-enrichment-adherence/DIGEST.md). The "Engine specification" section below is
> **superseded** and kept only as history; ENGINE-SPEC §15.3 lists its corrected claims.

Research gathered 2026-11-08 by six parallel research agents. Each folder has:
`LINKS.md` (every source: citation, URL/DOI, study type, evidence level, open access, local file),
`NOTES.md` (the agent's write-up and engine rules, each tagged with a source and a confidence level), and
`sources/` (downloaded open-access copies; git-ignored, local only).

| Folder                                                                      | Topic                                                                                                                                                                                                                         | Sources | Downloaded |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- |
| [01-learning-theory](01-learning-theory/)                                   | Reward vs aversive evidence, reinforcers, schedules, session dosing, advancement criteria, the 3 Ds                                                                                                                           | 47      | 19         |
| [02-problem-behaviors](02-problem-behaviors/)                               | Fear, reactivity, aggression, separation, noise, resource guarding; DS/CC, BAT, LAT; referral gates; gap review of `safety-policy.ts`                                                                                         | 80      | 62         |
| [03-development-life-stages](03-development-life-stages/)                   | Socialization window, vaccine gating, adolescence, adopted dogs, seniors/CCD, house training, exercise and growth                                                                                                             | 53      | 33         |
| [04-individual-differences](04-individual-differences/)                     | Breed (weak predictor), size, brachycephalic dogs, pain and medical causes, validated instruments + licensing, intake questionnaire                                                                                           | ~52     | 25         |
| [05-professional-standards-curricula](05-professional-standards-curricula/) | Credentials, LIMA, cooperative care, AKC STAR/CGC, KC Good Citizen → **skill graph** (46 rows in the 05 digest; restructured into 49 rows / 53 ids (incl. `enr.*` and `task.*`) in ENGINE-SPEC §9.1, changes listed in §15.3) | 50      | 36         |
| [06-life-skills-enrichment-adherence](06-life-skills-enrichment-adherence/) | Leash, recall, alone time, enrichment, sleep; **owner adherence**, time budgets, logging metrics                                                                                                                              | 43      | 27         |

**Evidence caveat (read this first).** Medical causes first, aggression referred to vet behaviorists, and vaccine-gated socialization are well supported. Force-free-only is a TuringCare product policy, stricter than CCPDT and IAABC (ENGINE-SPEC §1). The _dosing_ numbers (minutes per session, advance thresholds, socialization counts) are mostly trainer convention; no randomized trials exist for most of them, and no source gives weeks to fluency, so the engine shows none. How every number is tagged, sourced and recalibrated is in [ENGINE-SPEC.md](ENGINE-SPEC.md) §2, and the full list is in §15.1. Some DOIs are marked "unverified" in the LINKS files, and some sources were read only at abstract level.

---

## Engine specification (synthesis of the six NOTES) — SUPERSEDED by [ENGINE-SPEC.md](ENGINE-SPEC.md)

> Superseded. Several numbers and rules below are corrected by the digests (see ENGINE-SPEC §15.3). Do not build from this section.

### Pipeline

```
intake ──► 1. SAFETY GATE ──► 2. LIFE-STAGE BAND ──► 3. PRIORITY GOALS ──► 4. SKILL SELECTION (graph)
             │ hard stop?           │ caps, priorities      │ problems + owner goals   │ prereqs met, ≤1 new/wk
             ▼                      ▼                       ▼                          ▼
        referral plan         5. DOSING (time budget → sessions) ──► 6. WEEKLY PLAN ──► logs ──► 7. ADAPT
        (management only)                                                                 (advance/hold/regress/
                                                                                           shrink/re-gate)
```

Every output item carries a `rationale_code` such as `SOC_WINDOW` or `REF_BITE_L3`, which links it to the rule and source. The engine is a pure function: `buildPlan(intake, history, catalog, rules, today) → Plan`. It does no I/O and gives the same output for the same input.

### 1. Intake (inputs)

The full questionnaire is in 04 §4. The minimum viable set, in priority order:

| Group       | Fields                                                                                                                                                                                              | Feeds                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Profile     | date of birth, weight + body condition, breed(s) + **how sure** (DNA/papers/guess/unknown), flat-faced?, sex/neuter (info only), source (breeder/shelter/street/ex-breeding/unknown), adoption date | life stage, size band, priors, heat/exercise caps, settling plan |
| Health      | vet visit in the last 12 months, chronic conditions, medications/recent changes, pain-sign checklist, **sudden onset?**, senior sensory/cognition items                                             | safety gate (medical)                                            |
| Safety      | aggression targets, highest bite level (Dunbar 1–6), last incident, any child bitten, children under 12 / vulnerable people at home, considering rehoming? past aversive tools?                     | safety gate (behavioral)                                         |
| Problems    | structured list (jumping, mouthing, pulling, reactivity, separation, noise, guarding, house soiling…), each with frequency 0–4, intensity 1–5, distance at which the reaction starts, recovery time | goals, protocols, baseline                                       |
| Energy/fear | about 8 original 0–4 items (excitability, how hard to tire out, startle/recovery, stranger/dog fear)                                                                                                | priors, enrichment level                                         |
| Owner       | minutes/day, days/week, household members, other dogs, home type (apartment/house/yard; urban/rural), goals (pick ≤3), equipment, reward preferences                                                | dosing, household rules, skill selection                         |

Breed weighting: `trait = 0.25·breed_prior + 0.75·owner_observed`, and the prior is neutral if breed is unknown or mixed. Breed explains about 9% of behavioral variance (Morrill 2022). Breed only shifts emphasis and safety caps and never blocks a module (04, high).

**Licensing:** don't copy C-BARQ, DIAS or LSSS items verbatim. Write original items that measure the same constructs, and get permission from Penn or Lincoln before using validated scoring or norms (04 §4).

### 2. Safety gate (runs first, every time)

Consolidated from 02 §3.1/§4, 03 §4, 04 §5 and 05 rules 3–5. The output is a **mode**, not a boolean:

| Mode                                             | Triggers (any)                                                                                                                                                                                                                                                                                                                                      | Engine output                                                                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REFER_VET`                                      | pain/injury/limping; sudden onset (< ~4 wk); new behavior at age ≥ 7 or in the last 25% of expected lifespan; house soiling in a senior/adult-onset; med change; no progress or relapse after 4–6 weeks of a correct plan                                                                                                                           | vet check-in task; safe management and enrichment continue; exercises for the affected domain paused until "vet cleared" is recorded                                                                                      |
| `REFER_BEHAVIORIST` (DACVB/ECAWBM/CAAB, via vet) | any bite with skin contact; bite L≥3; multiple bites; any bite to a child; aggression that is escalating, multi-context or unpredictable; child/vulnerable person at home + human-directed aggression; panic/self-injury/escape; compulsive behavior; shutdown fear; severe separation distress; noise panic; owner considering rehoming/euthanasia | **management-only plan** (barriers, child supervision, avoid triggers, no punishment, muzzle only after professional input) + referral screen + trainer directory filtered to behavior credentials; no exposure protocols |
| `CAUTION`                                        | L1–L2 single warning, mild predictable resource guarding, mild noise sensitivity, mild puppy separation protest, past aversive tools                                                                                                                                                                                                                | allow the light module (trade games, management) + "consider professional help" banner; re-gate on any escalation                                                                                                         |
| `CLEAR`                                          | none                                                                                                                                                                                                                                                                                                                                                | full plan                                                                                                                                                                                                                 |

Constant rules (high confidence): never output aversive tools, flooding, dominance or punishment of growling; never recommend medication or supplements as treatment ("a veterinarian can discuss whether medication is appropriate"); never diagnose emotion, only record observable fields; never guarantee outcomes.

### 3. Life-stage band

From 03 §3.1. Adolescence ends at 15/18/24/24 months for toy-small/medium/large/giant; "senior" = the last 25% of expected lifespan.

| Band            | Top priorities                                                                                         | Session (per skill block)    | Sessions/day                      |
| --------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------- |
| pup 8–12 wk     | socialization checklist, handling, crate/rest/alone time, toileting, name/marker, mouthing redirection | 1–3 min                      | 3–6 (≤15–20 min structured total) |
| pup 12–16 wk    | socialization + habituation, leash intro, sit/down/come, impulse basics                                | 2–4 min                      | 3–5                               |
| juvenile 4–6 mo | maintain exposure, loose lead, long-line recall, settle, greetings                                     | 3–5 min                      | 2–4                               |
| adolescent      | higher reinforcement rate, lower criteria, long line, impulse/arousal, "dip at ~8 mo is normal" card   | 3–5 min                      | 3–4                               |
| adult           | owner goals, proofing, maintenance                                                                     | 3–5 min (≤10 if experienced) | 2–3                               |
| senior          | scent work, settle, cooperative care, low-impact, sensory-adapted cues                                 | 2–5 min                      | 2–4                               |

Modifiers: fearful −30% length; newly adopted → **settling plan** of 7 days (14 if fearful, ex-breeding, street or unknown history) with only name/marker and enrichment, and check-ins at days 7/30/90/180, expecting change rather than improvement. Present 3-3-3 only as a labeled rule of thumb. Puppy exposures are vaccine-gated: ≥1 set ≥7 days ago + dewormed. Dog parks are excluded.

**Conflict resolved:** agent 01 proposed 3–5 min sessions and agent 06 proposed 1–3 min. The table above uses the 06/03 values for puppies and fearful dogs and the 01 values for adults. Both are convention (low confidence), so they are tunable constants.

### 4. Skill selection

- Use the **skill graph in 05 §3** (46 nodes with prerequisites, level 0–5, observable pass criteria from STAR/CGC/KC). A skill unlocks only when its prerequisites are passed.
- Order of priority: safety mode → life-stage priorities → problem protocols (management items always first, then replacement behaviors) → owner goals.
- Max **1 new skill + 2 maintenance skills** per week; max 2 skills in active teaching; **≤5 actionable instructions per week** (06, med). With a problem behavior, that problem's protocol takes slot #1.
- Budget < 10 min/day → only the band's top 3 priorities.
- Mastered skills go to maintenance at 1 rep/week; they are never silently retired.

### 5. Dosing from time budget

- Plan minutes/week = **0.6 × declared minutes/day × 7**. The 40% slack absorbs missed days (06).
- Sessions/day = `ceil(plan_minutes_per_day / session_len)`, capped at 3 per skill per day and ≥1 h apart, never three in a row on one skill; 5–6 training days/week (01, 06).
- Daily floor for every dog: 5–10 min of scent/search work (10–20 for high-energy or working groups) + one chew/lick item; part of each walk is dog-led sniffing (06, low-med).
- Rest after the last session of the day, so no new skill within 1 h (Kis 2017, low-med).
- Each session gets an **if-then anchor** chosen by the owner ("after morning coffee") before the plan is finalized (06, med).

### 6. Reinforcement defaults

Small soft food by default, never praise alone. Rank rewards per dog (top 3 foods, top 2 toys) and re-check every ~4 weeks. Reward tier by distraction level: 1–2 → T1/T2, 3 → T2, 4–5 → T3. Continuous reinforcement while teaching, then thin; recall and leave-it keep high-value variable rewards for life. Treats ≤10% of daily calories (01).

### 7. Adaptation from logs

Inputs come from session logs (06 §4): trials attempted/successful, the current criterion value (distance m / duration s / distraction 1–5), latency bucket, stress flags from a controlled vocabulary (02 §3.7), and completion.

| Signal                                                 | Action                                                                                                                                                             | Conf    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| ≥80% over the last 10 trials in 2 consecutive sessions | advance **one** dimension (duration → distance → distraction); reset the others to baseline                                                                        | med     |
| 60–79%                                                 | hold; raise the reward rate or make it slightly easier                                                                                                             | med     |
| <60% for 2 sessions                                    | regress one step, shorten the session                                                                                                                              | med     |
| <40% **or any stress flag**                            | regress two steps, end the session, review management                                                                                                              | med     |
| 2 regressions at the same step                         | halve the step size or change reward/environment first                                                                                                             | med     |
| DS/CC protocols                                        | advance only after 3 calm trials across 2 sessions on different days; any stress → back 2; 3 regress sessions in a row → `REFER_VET` (+ behaviorist if aggression) | low-med |
| Reliable                                               | ≥3 locations × ≥2 handlers × ≥2 times of day                                                                                                                       | low-med |
| Completion <50% for 2 weeks                            | shrink to the minimum viable plan (1 skill, 1 daily 1-min rep), ask why from a fixed list, offer a new anchor                                                      | low-med |
| One missed day                                         | nothing (no streak punishment)                                                                                                                                     | med     |
| Problem frequency/intensity up for 2 weeks             | do not intensify; route to management review → professional                                                                                                        | med     |
| Adolescent band                                        | apply `regression_tolerance`: no failure framing, lower criteria                                                                                                   | high    |

### 8. Catalog needed

The current catalog has 5 templates and 21 skills; the target is the 05 skill graph plus protocol modules. Gaps, in priority order:

1. handling/cooperative care (collar/harness, hold, groom/exam, chin rest, consent touch ladder, stranger exam, muzzle)
2. socialization checklist
3. health gate
4. polite greeting, door, food manners, give/trade, vehicle, crowd walk, emergency stop, public settle
5. house training, crate, settling plan for adoptees
6. protocol modules as stage ladders: relaxation, separation graded absence, noise DS/CC, LAT/engage-disengage, handling DS/CC
7. owner-responsibility module

Store protocols as **stage data** (criteria and step parameters), paraphrased rather than copied (copyright: 05 §6).

### Open items before shipping numbers

- Have a DACVB or IAABC-certified advisor review the DS/CC defaults (02) and safety thresholds.
- Find a veterinary source for brachycephalic heat thresholds (~20 °C was proposed) and growth-plate ages.
- Extract CCDR/CADES cutoffs (03).
- Get licensing permission if any validated instrument is reused (04).
- Re-verify the DOIs flagged "unverified" in the LINKS files.
