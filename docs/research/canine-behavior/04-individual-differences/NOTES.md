# NOTES - Individual differences: breed, genetics, size, temperament, health, instruments

Scope: inputs for a deterministic (no-LLM) training-program engine. Numbers below come from pages/PDFs I read (see LINKS.md; "#n" = row). Where I relied on a search snippet only, I say so.

## 1. Key findings

**Breed is a weak individual-level predictor.**
- Morrill 2022 (#1, n=18,385): breed explains ~9% of behavioral variance (physical traits ~5x more); only 5.1% of breed-behavior pairs differ significantly vs 41.5% for physical traits; ~67% of purebreds within 1 SD of their breed mean, ~95% within 2 SD; age ~1.8%, sex <1%. Example: a mixed dog's chance of top-quartile human sociability ~22%, ~40% if golden retriever. Retrieving most heritable behavioral trait (~52%), human sociability ~67%.
- MacLean 2019 (#2): among-BREED heritability avg 0.51 (0.27-0.77) - trainability .73, stranger-directed aggression .68, chasing .62, attachment/attention-seeking .56. This is breed-mean variance, ~5x higher than within-breed estimates; it is NOT how predictable one dog is.
- Ilska 2017 (#13): within-breed (Labrador) heritability substantial only for some traits (fetching, loud-noise fear), negligible for others; polygenic.
- Fadel 2016 (#14): working vs show LINE mattered more than breed for impulsivity; within-breed variance > between-breed; effects small.
- Dutrow 2022 (#3): breed-average C-BARQ correlates with genetic lineage: herders-nonsocial fear (r=.64), terriers-chasing (.69), scent hounds-lower trainability (-.68); sighthounds no significant correlate; working/sporting breeds more trainable. Breed-mean correlations only; owner-reported.
- Turcsan 2011 / Svartberg 2006 (#43, #44; snippets only): trainability and boldness differ across breed clusters; behavior follows current selection/use more than ancestral function.
- Breed IDs are unreliable: shelter staff labelled 52% pit-bull-type vs DNA 21% (#45, snippet); visual vs DNA poor (#46). Owner-entered "breed" is noisy for mixes.

**Size.** McGreevy 2013 (#4): 33/36 C-BARQ traits correlate with height/weight/skull shape. Smaller/shorter: more separation problems, touch sensitivity, owner-directed aggression, begging, attention-seeking, excitability/hyperactivity (lighter); trainability increases with height. Puurunen 2020 (#20): small size associated with social fearfulness. Sulkama 2021 (#17): medium dogs highest hyperactivity/impulsivity. Morrill (#1) finds size explains almost none once breed/genetics modeled -> size effects are partly confounded by breed and how owners treat small dogs. Caveat: breed-level, owner-reported.

**Sex/neuter status (evidence is correlational and small).**
- Sex: males somewhat more aggressive and hyperactive; females more fearful (Salonen #16, Sulkama #17). Morrill: sex <1% of variance.
- Neutering: McGreevy 2018 male (#22), Starling 2019 female (#23): later/longer intact -> fewer fear/aggression items; per-unit effects ~5-12% and cross-sectional; authors decline blanket advice. Farhoody 2018 (#24): no association with aggression to familiar people/dogs; stranger-aggression effect only in the 7-12 mo group (OR 1.26), possibly false positive. Fadel (#14): neutered males higher DIAS scores, reason unknown. Torres 2013 (#25): joint-disorder risk with early neutering in Goldens (breed-specific health effect). Conclusion: neuter status = weak, confounded covariate; engine should NOT recommend or discourage neutering - defer to the vet.

**Energy / impulsivity.** Sulkama (#17): hyperactivity/impulsivity highest in young dogs and males; <1 h/day exercise and >8 h alone associated with higher scores; comorbid with compulsion, fearfulness, aggression (association not causation). Tiira & Lohi (#21): less daily exercise associated with more noise sensitivity and separation anxiety. Salonen (#16): separation-related behavior co-occurs with hyperactivity (RR 4.1) and inattention (RR 3.4); aggression with fearfulness (RR 3.2). C-BARQ has an "Energy level" subscale (3 items in short form).

**Fear/anxiety/environment (modifiable).** Poor puppy socialization, low activity, urban living, poor maternal care associate with fear (Puurunen #20, Tiira #21, Hakanen #19, Serpell #10). Directions may be partly reverse (fearful dogs get less activity). Prevalences in Finnish pets (#16): noise sensitivity ~32%, fearfulness ~29%, aggression ~14%, separation ~5-6%.

**Medical contributors.**
- Pain: Mills 2020 (#26): pain suspected in ~1/3 of referral behavior cases (range 23-82% by clinic; confirmed in 16-79% of suspected) - low-quality evidence but strong clinical consensus. Linked to owner/handling-related aggression (brief, low-intensity, hindquarters/lying-down contexts), noise sensitivity widening or late onset, reluctance to walk/jump/stairs, resource guarding of water, compulsive licking, house-soiling, poor performance. Fagundes 2018 (#28, n=20 qualitative): musculoskeletal-pain dogs had later onset (~6.5 vs 2.8 y) and generalised noise responses (8/10 vs 2/10).
- Camps 2019 (#27): pain strongest; thyroid link controversial (do not treat euthyroid dogs for behavior); Radosta 2012 (#47) found no difference in standard thyroid analytes in aggressive dogs; epilepsy and silent brain tumors (older onset) moderate; portosystemic shunt/liver dysfunction as a rare fear/behavior-change cause; sensory loss (e.g., partial blindness) can cause new fears. Atypical age of onset = escalate.
- GI/gut-brain: Mondo 2020 (#40) preliminary only; Mills lists GI disease with compulsive licking/staring/fly-snapping, resource guarding. Treat as "vet check" signal, not a training variable.

**Brachycephalic limits.** Packer 2015 (#37): BOAS in 10% (referral) to 38% (non-referral brachy sample); risk increases non-linearly as muzzle shortens (affected only if muzzle <half cranial length), with thick neck and obesity; snoring etc. normalised by owners. Hall 2020 (#37b, snippet): 74.2% of heat-related illness events were exertional; brachycephalic breeds, young dogs <2 y, dogs >=10 kg, Chow, Greyhound, Springer higher odds. => heat/exertion caps are real, evidence-based safety rules.

**Instruments.** See section 4. C-BARQ (Hsu & Serpell 2003) = the best-validated, largest-norm owner instrument; DIAS (18 items), LCAS (16), LSSS (17), CFQ (21), MCPQ-R (26) are narrower. Short C-BARQ (42 items) correlates r 0.52-0.83 with the long form by domain (#7). Test-retest/temporal stability is only moderate in guide dogs (#11).

## 2. Strong vs weak vs contested

| Claim | Status |
|---|---|
| Breed differences exist on average for some traits (trainability, chasing, stranger aggression, retrieving, sociability) | Strong (#1-#3) |
| Breed predicts an individual dog's behavior well | Contradicted - ~9% variance (#1), within-breed > between (#14) |
| Breed-group ancestral function maps cleanly to behavior | Contested - lines/current selection matter more (#14, #43, #44); herder/terrier/scent-hound lineage correlations hold at breed-mean level (#3) |
| Breed label from owner/visual ID is accurate for mixes | Weak (#45, #46) |
| Brachycephalic breeds: airway/heat/exertion risk | Strong (#37, #37b) |
| Pain contributes to a meaningful fraction of behavior problems | Moderate-clinical consensus, low-quality data (#26-#28) |
| Hypothyroidism causes aggression | Contested/weak (#27, #47) |
| Neutering causes fear/aggression | Weak, small, confounded; mixed (#22-#24) |
| Size predicts behavior | Moderate at breed level (#4), unclear causality; Morrill finds little |
| Low exercise/socialization associate with fear, noise sensitivity, hyperactivity | Moderate consistent associations (#17-#21), causality unclear |
| Early socialization reduces later fear/aggression | Moderate (#10, #51) |
| Gut microbiome - behavior | Weak/preliminary (#40) |
| Personality questionnaires (C-BARQ, MCPQ-R, DIAS) reliable enough for planning | Moderate; owner-report bias; temporal stability moderate (#7, #11, #35) |

## 3. ENGINE RULES

Design stance: breed = prior with a small weight, overridden by owner-observed behavior from the intake. Always show the owner how breed influenced anything ("Typical for the breed, not a prediction for your dog"). Never lower the safety rules by breed.

Confidence: H/M/L. Rule IDs are for engineering reference.

**Priors and weighting**
- R1 (H): Weight rule: `final_trait_score = 0.25*breed_prior + 0.75*owner_observed` when owner data present; if no observed data, `0.5*prior + 0.5*neutral`; mixed/unknown breed -> prior = neutral (all 0). Cap any breed-derived adjustment to +/-1 step on a 5-step scale. Source #1, #14.
- R2 (H): Breed input is never a gate for access to a module, only for default emphasis and safety limits (R12-R16). #1, #45.
- R3 (M): Accept breed as "group + confidence". For mixes or shelter dogs with unverified breed, ask "do you know the breed?" Record `breed_confidence` (DNA-tested / papers / guess / unknown); guess/unknown -> use size + energy questions only. #45, #46.
- R4 (M): Group priors table (modest, owner-observed overrides). Data form: `{group, trait, delta(-1..+1)}`:
  - herding: nonsocial fear/noise +1, chasing/motion-reactivity +1, energy +1, trainability +1 (#3)
  - terrier: chasing/predatory +1, excitability +1, trainability -0 (#3, #17)
  - scent hound: trainability(recall/focus) -1, scent-work enrichment +1 (#3)
  - sighthound: chasing +1 (snippet only, #3 notes no significant lineage correlate -> LOW confidence); exertional heat caution for Greyhound (#37b)
  - sporting/retriever/working: trainability +1, retrieving +1, human sociability +1 (#1, #3)
  - guardian/flock-guard: stranger-directed wariness +1 (low confidence; not directly verified in my sources)
  - toy/small: separation, touch sensitivity, owner-directed/attention behaviors +1, social fear +1 (#4, #20)
  - brachycephalic: add exercise/heat/airway rules (R12-R15) instead of behavior traits.
- R5 (M): Working-line vs show-line question for sporting/herding breeds: working line -> impulsivity/energy +1, show line -> 0. #14.
- R6 (M): Size priors (use only to fill in missing observations): <10 kg: separation/touch/excitability +0.5; large/giant: trainability +0.5, but also joint/exercise caps for pups (R16). #4, #20.
- R7 (L): Sex adds nothing to behavior plan except where owner reports: intact males flagged for "management of roaming/marking" only if owner reports. Do not give neutering advice; show "talk to your vet about neutering timing". #22-#25.
- R8 (M): Age band effect: puppy/adolescent (<2 y) -> energy/impulsivity +1; senior (>=7-8 y or breed-adjusted) -> new fears/noise sensitivity/house-soiling trigger medical-flag (R10). #17, #16, #28.

**Health flags -> pause/refer**
- R9 (H): Any bite/snap history with injury, or aggression of rising severity -> stop generic program, show referral to vet + DACVB/CAAB/IAABC behavior consultant. #26-#27, #50 (safety).
- R10 (H): New-onset or sudden-change behavior (aggression, fear, soiling, noise phobia, restlessness, compulsive licking/staring) OR onset after age ~5-6 y without clear trigger OR noise response generalising to places/cars -> `requires_vet_check = true` BEFORE any behavior-modification module; allow only management/safety content until owner confirms vet visit. #26-#28 (clinical consensus; confidence M-H).
- R11 (M): Pain screen: if >=2 of {reluctance to jump/stairs/walk, stiff/limping, snaps when touched/handled near hips/back, licks/chews one area, slips on floors, wakes stiff, older than 7 y} -> vet pain-assessment prompt; lower physical-demand modules (no repetitive sit-to-down, no jumping, shorter walks). #26. Also suggest LOAD/CBPI/HCPI validated pain questionnaires through the vet, not as diagnosis. #48, #49.
- R12 (M): Medical-contributor checklist asked in intake (thyroid signs, GI signs, sensory loss, seizures, heart/breathing) -> any "yes" without a vet check in the last 12 months -> vet prompt. Do NOT infer a diagnosis. #27.
- R13 (L): Repetitive/compulsive behavior (tail-chasing, fly-snapping, staring, flank/surface licking) -> vet + behaviorist; engine offers only enrichment/management. #26, #16.

**Brachycephalic and exertion caps (safety; deterministic)**
- R14 (H): `brachy = true` for pug, Fr. bulldog, Eng. bulldog, Boston, Pekingese, Shih Tzu, Cavalier-type and other flat-faced breeds (maintain a list; Boxer/Cavalier less strong evidence). #37, #37b, #38.
- R15 (H): If brachy: max continuous exertion with timed, cool-day cap (suggest 10-15 min bouts, rest-breaks, no hard exercise above ~20 C / 68 F; the temperature threshold is my engineering suggestion, not from a cited study - validate with a vet source); no exercise in heat; no vigorous exercise after meals; owner told that snoring/noisy breathing is not "normal"; any collapse/laboured breathing -> vet. #37, #37b.
- R16 (M): Heat rule applies to ALL dogs: reduce intensity on hot days, with higher caution for brachy, obese, Chow-type thick coats, Greyhounds, young (<2 y), and large (>=10 kg) dogs - exertional heat illness is the largest category (74%). #37b.
- R17 (M): Puppy/giant-breed joint caution: no forced repetitive/high-impact exercise or long runs for growing pups; use short sessions. Evidence (Krontveit 2012 on hip dysplasia housing/exercise) not read - paywalled, so the numeric limits (e.g., minutes per month of age) are LOW confidence "common guidance" and should be sourced from vet orgs before shipping.

**Energy level**
- R18 (M): Derive `energy_tier` (1-5) from owner-observed rating (C-BARQ Energy level items + owner estimate of daily exercise needed) with breed prior +/-1; low exercise + high hyperactivity -> add structured-exercise/enrichment/rest-training before obedience modules. #17, #21.
- R19 (M): If hyperactivity/impulsivity high AND exercise <1 h/day OR alone >8 h/day -> recommend increasing activity/enrichment and flag time-budget conflict (don't diagnose ADHD-like). #17.

**Impulsivity / sound / frustration**
- R20 (M): DIAS-style score high -> prioritise impulse control exercises (wait/settle/leave-it), shorter sessions; low "responsiveness" -> reward-value work. #14, #15, #32.
- R21 (M): Noise sensitivity: LSSS/LCAS-like total above threshold (LSSS >30 per vendor; LCAS cutoff not verified) -> desensitization module + sound-proofing/safe-space management + vet referral for severe/phobic or late-onset/generalising (R10). #28-#30.
- R22 (L): Frustration (CFQ) high -> add frustration-tolerance games (barrier, waiting) before leash-reactivity modules. #34.

**Methods**
- R23 (H): All plans use reward-based, force-free methods regardless of breed/size (no "tough breed -> firm methods" rule). #50.
- R24 (M): Fear/aggression + social-fear indicators -> weight early-socialization/counter-conditioning modules; for puppies <16 weeks prioritise socialization checklist. #10, #20, #51.
- R25 (M): Re-assess every N weeks; do not lock a temperament label (temporal stability only moderate). #11.

## 4. Proposed intake questionnaire

Licensing summary (important):
- C-BARQ (Penn): free for individuals to register; terms-of-use text not retrieved; commercial/embedded use is not described -> do NOT copy items verbatim into the product without written permission from Dr. James Serpell / Penn (short form was reused by DAP with permission, #7). Safe alternative: write original items measuring the same constructs (behaviors, not copied wording), and optionally "link out" to cbarq.org.
- DIAS, LSSS: University of Lincoln "Free Licence (Restricted)": free for personal use; commercial use requires contacting contracts@lincoln.ac.uk (#30, #31). LCAS/CFQ papers are open access but reuse terms for the instruments were not stated; ask authors.
- MCPQ-R, HCPI, LOAD, CBPI: reuse terms not verified.
- Paper text under CC-BY (PLoS, Frontiers, Sci Rep, MDPI) covers the article, not necessarily the instrument.
Recommendation: build original short items (own wording, 0-4 scales mirroring C-BARQ-style frequency/severity anchors, which are generic), and seek permission before using any validated scoring/thresholds or norms.

Scale conventions: frequency 0=never,1=rarely,2=sometimes,3=usually,4=always; N/A allowed -> missing. Domain score = mean of answered items.

**A. Profile (hard params)**
1. Age (months), 2. Weight (kg) + body condition (1-9 pictorial) -> size band, obesity/heat flags (R15-R16).
3. Breed (searchable list, multi-select for mix) + "how sure" (DNA/papers/guess/unknown) -> breed_confidence, group priors (R1-R4).
4. Skull type: flat-faced? (yes/no/not sure) -> brachy flag (R14).
5. Working/sport line vs show/pet line (if sporting/herding) -> R5.
6. Sex, neuter status (info only, R7).
7. Source/age at adoption (puppy-raised/shelter/unknown) -> history modifier.

**B. Health screen (flags; yes/no/unsure)** -> R9-R13
- Vet check in last 12 months? Chronic conditions (joint, thyroid, GI, seizures, heart, eyes/ears, skin)? Medications?
- Pain signs list (R11): stiff on rising, reluctant to jump/stairs, yelps when touched, licks one spot, slips, limp, sleeps more/restless at night.
- Noisy breathing/snoring/exercise intolerance/collapse (brachy and others).
- Onset: did the problem begin suddenly or after age 5? (R10)
- Appetite/stool/vomiting problems with behavior changes.
- Vision/hearing concerns.

**C. Energy and impulsivity (5-8 items, own wording)** -> R18-R20
- C1 Energy: "How hard is it to tire out?" 0-4. C2 Hours/day of real activity currently (0-<1,1-2,2-3,>3). C3 Calms down indoors within 20 min after activity (freq). C4 Hard to stop/restart (e.g., jumps up, mouths) (freq). C5 Reacts quickly/overexcited to guests/doorbell (freq). C6 Hours alone/day (0-4,4-8,>8). C7 Easily distracted on walks (freq). C8 Gives up/frustrated when blocked by a barrier or waits (freq).
Highest-signal items per literature: exercise hours, time alone, age, and owner-rated excitability (#17, #21).

**D. Fear / sound / social (8-10 items)** -> R10, R21-R24
- D1 Startles/panics at sudden noises (0-4 severity); D2 fireworks/thunder specific; D3 noise reaction spreading to places/other situations (yes/no; R10); D4 fear of strangers; D5 fear of unfamiliar dogs; D6 fear of surfaces/objects/handling; D7 puppy socialization quality (checklist 0-4); D8 recovery time (minutes) after a scare; D9 trembling/hiding/panting/pacing events.

**E. Aggression/bite history (safety; 6 items)** -> R9
- Targets (family/strangers/dogs), severity (growl/snap/bite/puncture), contexts (food, handling, resting, visitors), last incident date, any child in home, any injury. Bite with puncture or injury -> R9 pathway.

**F. Separation / attachment (3-4 items)**: distress when alone (0-4), destructive/howling, soiling, follows owner room to room.

**G. Trainability (3-5 items)**: responds to known cues (freq), works for food/toy (0-4), retrieval interest, off-leash recall, chasing prey/motion.

**H. Optional personality (MCPQ-R style, 5 dims)**: skip in v1; low incremental value over C/D/G - adds user burden. Consider later if permission secured.

**I. Owner context (not covered by this topic; keep short)**: time budget, other pets/children, goals, home/yard, urban/rural (urban living was associated with fear, #20).

Most predictive, least burdensome (priority order, based on literature, not a fitted model): (1) age + size/weight, (2) sudden/late-onset flag, (3) pain screen, (4) aggression history, (5) noise/fear items, (6) exercise hours + hours alone, (7) breed group + confidence, (8) excitability/energy, (9) trainability. No dataset available here to validate item rankings.

## 5. Safety / referral red flags
- Any bite that broke skin, escalating aggression, aggression toward children, or unpredictable aggression -> stop program, vet + credentialed behavior professional (DACVB/CAAB/IAABC). 
- Sudden or late-onset behavior change, new aggression, new noise phobia generalising, night waking/pacing in seniors, disorientation (possible cognitive dysfunction/pain/neurological), seizures, collapse -> vet first.
- Brachy or any dog with labored/noisy breathing, blue/pale gums, collapse, heavy panting not resolving after rest -> emergency vet; heat first-aid (cool, not ice-cold) - see RECOVER first-aid guideline (#, not downloaded).
- Suspected pain signs (section R11), compulsive self-injury, pica with vomiting.
- Panic with self-injury (noise phobia) -> vet for anxiolytic evaluation; training alone is insufficient.
- Never prescribe aversive tools/methods; any user request for them -> redirect (#50).
- Engine must not diagnose or recommend medication/neuter timing; messages are "ask your vet".

## 6. Open questions
1. C-BARQ commercial licensing: need written terms from Penn/Serpell (contact) - could we use item constructs in original wording?
2. LSSS/DIAS/LCAS cutoffs: obtain peer-reviewed validation for LSSS; confirm LCAS cutoff; evaluate reuse licensing and fees.
3. Which breeds are on the brachy list, and what temperature/duration caps are defensible? Need vet-association source (e.g., RECOVER, veterinary heat guidance) rather than my R15 suggestion.
4. Puppy/giant-breed exercise limits: need open source (Krontveit 2012 paywalled; AKC/vet guidance is not peer-reviewed).
5. Breed-group trait numbers: Dutrow gives lineage correlations (r), not per-dog effect sizes; Morrill gives per-breed effects. Consider obtaining Darwin's Ark/C-BARQ breed-mean tables to build the prior table from data, with shrinkage toward mean.
6. Guardian/flock-guard and sighthound priors: not well covered by sources read (Dutrow: sighthounds no significant correlate).
7. Sex/neuter: evidence is cross-sectional; keep as informational only. Any engine use needs a clinician-reviewed policy.
8. Test-retest stability of the intake items (and whether the owner's answers should be recomputed after training).
9. Not covered: Cognitive dysfunction scales (CADES/CCDR), DPQ, CBPI original, AAHA behavior guidelines, thyroid/GI primary studies - paywalled or not retrieved.
10. Source-count caveat: ~40 sources listed; ~26 files downloaded (open copies only). Several details rely on search snippets (flagged).
