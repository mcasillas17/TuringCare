# NOTES — Life skills, enrichment, and owner adherence

Scope: everyday skills (house-training, crate, loose leash, recall, settle, alone-time), enrichment/sleep/welfare, and the owner side (will people actually do it). Numbers in [#] refer to rows in LINKS.md. Where a rule is my engineering synthesis rather than a direct finding, it is labelled DESIGN HEURISTIC. Honest headline: the dog-science evidence for exact "doses" of daily skills is thin; the owner-adherence evidence is more useful for scheduling than the canine evidence.

## 1. Key findings

**Learning dose and spacing**

- Demant 2011 (44 beagles): weekly single sessions acquired a task better than daily sessions, and one session beat three in a row; long-term retention at 4 weeks was unaffected by schedule [#2, secondary summary]. Practical reading: do not stack many sessions back to back; distributed practice is at least as good.
- Kis 2017: dogs that slept or took a leash walk in the hour after learning new cues did better a week later; dogs that did more learning, or played, did not gain at the immediate retest [#1, verified]. Sleep-dependent consolidation is plausible but the design cannot rule out walking effects, and n is ~12-14 per group.
- Fear Free (hosted by AVSAB) guidance: ~3 min sessions, puppies ~1 min, new dogs shorter; end sessions with something enjoyable; set a timer or pre-count 10-20 treats [#40, expert guidance, no trial behind the exact numbers].
- Recall dose in the one controlled trial: two sessions/day over 5 days, ~28 min of video per day, reward-trained dogs on a 10 m line within ~1 m of trainer, food on return, fewer cues than e-collar groups [#9].

**Equipment / leash**

- Back-clip harness did not reduce pulling vs collar when food was the lure (more force and duration), toy lure no difference; no stress-behaviour difference [#5]. 2025 review: non-tightening front-clip harness for pullers, flat collar for non-pullers, caution with tightening harness/martingale/head collar [#7]. PeerJ 2024 compared four devices; martingale differed in impulse; no device eliminated pulling [#6]. Conclusion: equipment manages, training solves.
- Owner surveys: pulling and recall problems top the owner-reported list through 18 months, peaking around 12 months [#24].

**Aversive vs reward methods**

- Observational and review evidence consistently links aversives with worse welfare markers (cortisol, stress behaviour, pessimistic bias) and no efficacy advantage [#10, #11, #13, #12, #9]. Causality is inferred, not proven (no randomised long-term pet-dog trials).

**Alone time / separation**

- Desensitisation + counter-conditioning with gradual absence is the best-supported approach; start at seconds, return before distress, retreat a step if signs return, no punishment [#18]. A food-stuffed toy was the instruction owners most reliably followed [#18]. Owners given >5 instructions had worse outcomes [#17]. Compliance fell during graded-absence work [#20].
- No validated "hours alone" welfare threshold; one small study saw altered greeting/activity after 2 h [#21]. Treat any hours cap as a design heuristic.

**Crate / house-training**

- No good controlled evidence on housetraining methods or crate welfare. Owner surveys: ~25% of owners crate, mostly puppies <6 months; distress higher when crating is used to manage behaviour rather than train; average use ~4+ h/day in Denmark; authors say welfare impact is unknown [#36, #37]. Crate use falls from 67% (16 wk) to 36% (12 mo) [#26]. House soiling shows up as an *association* with puppy-class attendance (OR 1.56) most likely because soiling is why people enrol [#25]. => Housetraining/crate rules below are low confidence and come from standard force-free practice, not trials.

**Enrichment, optimism, sleep**

- Nosework for 2 weeks shifted judgment bias optimistic vs heelwork (n=20) [#3]; a 2024 paper cautions bias tests can reflect learning history [#4]. Toy provision alone did not change welfare measures [#30]; food puzzles produced the smallest behavioural changes in one pilot [#31]; stuffed toys help short-term in kennels [#29]. Sniff-walk duration has no evidence base [#43].
- Sleep: owner-reported ~11 h/24 h in young dogs (7 h night + 3-3.5 h day) [#26]; "12-14 h" is a popular figure, owner-report data run lower [#28]. Shelter dogs: daytime rest may be a welfare signal [#27].
- Exercise: the "5 min per month of age" rule has no research basis; avoid both heavy repetitive high-impact exercise in growing large-breed puppies and overly strict restriction [#42, C-]. No evidence-based exercise minutes by breed group were found in this pass (open question).

**Owner side**

- Adherence in human medicine is ~64% overall and 20-30% when lifestyle change is needed [#16, quoting human/AAHA data]. Dog-behaviour adherence is under-studied. Predictors: trust in advisor, co-created plan, concern about distress to the dog, feeling not judged [#15, #16].
- Dropout: free face-to-face class 43% dropout, online-only 100% (tiny pilot), paid class 24%; reasons include illness, work, dog problems [#22]. 67% of puppy owners attended a class; many prefer to train themselves [#23]. Home-only trainers report more problems and inconsistent owner-dog interaction than class attenders [#13] (confounded).
- Habit formation: median 66 days (18-254) to automaticity; a single missed day did not matter; complex behaviours take longer [#38]. Implementation intentions (if-then plans) d~0.65 [#39]. These are general-psychology findings, not dog-specific, but they are the best evidence for plan design.
- Owner traits, attachment and interaction style are associated with outcomes [#33, #34].
- Children: bites to young children mostly occur at home with a familiar dog, often during benign contact; supervision attitudes drive risky child behaviour [#35].
- Multi-dog / multi-person consistency: NO controlled evidence found. Only practitioner guidance (same cue words per behaviour, same household rules). Treat as best practice, low confidence.

## 2. Strong vs weak vs contested

- Strong-ish: reward-based methods at least as effective as aversive and better for welfare (multiple designs, converging); spacing/short sessions do not hurt and may help (one lab study + learning science); habit and implementation-intention effects (human); too many instructions hurts adherence (one cohort + general human literature); client-centred plans improve adherence (survey/associational).
- Weak: sleep consolidation magnitude in dogs (small n); nosework -> optimism (n=20, confound flagged); owner-reported sleep numbers; session-length minutes (expert opinion only).
- Contested / unknown: crate welfare; hours-alone thresholds; harness effect on pulling and gait (equipment device-specific); whether early puppy training start age matters (no difference 1-3 vs 5-6 mo in one retrospective survey); puppy exercise rules; value of food puzzles for pet dogs; multi-person consistency; optimal sniffing time.

## 3. ENGINE RULES

Confidence tags: high = multiple converging sources; med = one decent source or strong general-science analogue; low = practice consensus or design heuristic. All numeric defaults should be configuration constants, not hard-coded logic, so they can be tuned from real usage data.

**A. Weekly load by owner time budget** (DESIGN HEURISTIC anchored on [#16, #17, #38, #40]; confidence med)

1. Count what the owner can actually do, not what is ideal: budget_minutes_per_day from onboarding, default 10 if unknown. Weekly plan minutes = 0.6 x declared budget x 7 (leave 40% slack so a missed day does not break the plan). Fear Free-style sessions are 1-3 min, so 10 min/day = 3-5 micro-sessions at most.
2. Session length by dog: puppy / new-to-training / fearful: 1-2 min; adult: 3 min; experienced adult: up to 5 min; senior or low-stamina: 2-3 min. Hard max 5 min per skill block in v1 [#40, low-med].
3. Max 1 new skill + up to 2 maintenance skills per week; max 5 actionable instructions total per week including management tips. [#17 >5 instructions hurt outcome; med]
4. Max concurrent "active teaching" skills = 2; for dogs with a fear/anxiety/separation problem, make the behaviour-change problem skill #1 and cap total at 3 including management. [#18, med]
5. Prefer spaced practice: at most 2 sessions per skill per day, separated by >=1 hour or a meal/rest; no 3-in-a-row on the same skill. Daily short practice is acceptable (retention was not harmed); 3-5 days/week per skill is a sufficient target. [#2, med]
6. Schedule 5-10 min low-demand wind-down or sleep opportunity after the day's last formal session; never schedule more training in the hour after a lesson aimed to be consolidated, prefer a walk or rest. [#1, low-med]

**B. Habit and sustainability** (confidence med)
7. Every scheduled practice gets an if-then anchor chosen by the owner ("after I pour morning coffee, 2 min of mat"). Require anchor selection before finalising the plan. [#39, #38]
8. Do not treat one missed day as failure; streaks reset nothing. Only trigger adaptation after >=3 missed planned sessions in 7 days or <40% completion over 2 weeks. [#38, med]
9. Expect ~8-10 weeks for the routine to feel automatic; show this in the UI; do not escalate load before week 3 of a routine unless completion >=80%. [#38, med; median 66 days, large spread]
10. Co-create: let the owner pick among 2-3 equivalent exercises/times; owner sees why each exercise exists. [#15, #16, med]
11. Avoid more than ~5 steps in a protocol view; show only the next step. [#17, #18, med]

**C. Adaptation from logged practice** (DESIGN HEURISTIC; confidence low-med, no dog-specific thresholds in literature)
12. Success rate over last 10 trials (3 sessions minimum): >=80% for 2 consecutive sessions -> advance one criterion (one variable only: distance OR duration OR distraction, never two); 60-79% -> repeat; <60% for 2 sessions -> go back one step and shorten the session; <40% or any stress flag -> go back two steps and check management/environment. [general shaping practice; low-med]
13. If an owner repeatedly logs sessions >5 min or >2 criteria changed, surface a gentle "shorter is better" tip, not a block. [#40]
14. If completion <50% for 2 consecutive weeks: automatically drop to a minimum viable plan (1 skill, 1 daily 1-minute rep tied to existing anchor), ask what got in the way (time, dog, family) from a fixed list, and offer to change anchor/time. [#16, #22 reasons list, low-med]
15. If the logged outcome worsens (frequency/intensity of problem up for 2 weeks) route to "review management / consider professional help" instead of intensifying training. [#18, med]
16. Maintenance: skills mastered stay in a rotation of 1 rep/week prompts; do not retire them silently. [DESIGN]

**D. Daily enrichment minimums** (all DESIGN HEURISTIC / expert consensus; confidence low unless noted)
17. Every day: >=1 scent/search activity (scatter feed, snuffle mat, find-it, or a sniffy walk segment) of 5-10 min for all dogs; raise to 10-20 min for high-energy, working/hunting/herding groups, or dogs flagged bored/frustrated. Evidence base: nosework optimism effect (n=20, med-low) [#3, #4]; sniff duration has no evidence [#43].
18. Every day: >=1 chew/lick opportunity (stuffed toy/long-lasting chew) especially before alone time; prefer this over novelty toys, since toy provision alone did not improve welfare measures [#18, #30, #31, #29, med-low].
19. Exercise: no evidence-based minutes by breed. Provide tiers (low/moderate/high) that scale walk count and duration with age, size, energy, health; for puppies use "short and frequent, avoid forced repetitive running/jumping", do NOT cite the 5-min-per-month rule as science [#42, low]. Health conditions (orthopaedic, brachycephalic, cardiac) override upward scaling: require vet clearance prompt.
20. Rest is part of the plan: protect >=2 quiet rest blocks in the day for puppies and show total sleep expectation as a wide range (about 8-14 h; puppies and seniors higher) with a flag if owner logs very low sleep/restlessness [#26, #27, #28, low-med].
21. Prefer "choice" in walks: at least a portion of each walk is dog-led sniffing, and heel/leash-skill practice is a separate short session, not the whole walk. [#3, low]

**E. Skill-specific rules**
22. Loose-leash: teach in low-distraction areas first; reward position (food at the owner's side), 1-3 min sessions; walks themselves are not training. Equipment: recommend flat collar for non-pullers, non-tightening front-clip or Y-front harness for pullers; never recommend prong/choke/shock; warn that a back-clip harness will not fix pulling. [#5, #6, #7, #12; med]
23. Recall: only on a long line (about 10 m) in a secure area during teaching; reward every success with food or a game; use cue once; progress distance then distraction separately; never call the dog to something aversive. [#9; med for protocol, high for "no aversives"]
24. Settle/mat: dog must be able to hold a down for a short time; build duration in seconds -> minutes; use as pre-alone-time skill. Evidence is practitioner only (Overall relaxation protocol, no controlled study found). [low]
25. Alone-time: baseline assessment (can the dog stay calm 1 min with owner out of sight?). Start below the shortest duration that triggers distress; absences of seconds; randomise short/long once stable; owner returns before the dog panics; any panic signs -> back one step and flag separation-related problem and recommend vet/behaviourist. Avoid prescribing an hours-per-day cap; instead warn above ~4 h for young puppies and require a break plan (heuristic) [#18, #21; med for method, low for numbers].
26. House-training (low confidence; no trials): frequent scheduled toilet trips (after waking, eating, play, at least every 1-2 h for young puppies), reward outdoors immediately, supervise or confine when unsupervised, never punish accidents. Log accidents, location and last toilet time; escalate to vet if sudden regression or adult-onset soiling. [low]
27. Crate: introduce gradually with food; never as punishment; do not use to manage separation problems; flag if the owner logs >4 h/day crate use or any distress [#36, #37, #26; low].

**F. Household consistency** (practice consensus; no controlled evidence; confidence low)
28. One shared cue-word list per dog per household, editable by all members; the plan view shows the same cue words to every member. Multi-person: assign one "primary trainer" per skill; others "maintainers". [#13 home training inconsistency; low]
29. Multi-dog: train new skills individually (separate rooms) first; schedule per-dog sessions; share only management rules across dogs (same furniture rule for all). [practice; low]
30. Children: dog-child supervision rules are mandatory content when household has children <10: adult present for all interactions, dog has a retreat space, no hugging/face-to-face, teach children to stop and let dog opt out; reduce training tasks given to children to "assistant" roles. [#35; med]

**G. Environment**
31. Urban/apartment: add indoor enrichment; plan leash-skills for crowded sidewalks (distance management); noise/trigger log. Rural/yard: do not treat the yard as exercise or training; keep recall in a secure area. Home-vs-urban differences in outcomes were not found in the literature - rules are practice-driven (low).

**H. Age and phase**
32. Adolescence (6-18 months): expect rising owner-reported pulling, barking, jumping, recall issues, peaking at ~12 months; pre-warn owners and temporarily lower recall/leash criteria rather than treating as failure [#24; med].
33. Puppy training start: class attendance by 6 months is associated with fewer problems, but starting at 1-3 vs 5-6 months showed no difference; do not push owners to rush early formal training [#25; low-med].

## 4. Progress-logging metrics the app should capture

Per session (all optional except first three, keep it < 20 s):

- date/time, planned vs done, duration (minutes) — completion and dose.
- trials attempted and successful (success counts -> % success; most reliable owner metric; use 5-10 trials).
- criterion variable currently being worked on: distance (m), duration (s), distraction level (1-3 or named), latency to respond (s; bucket <1, 1-3, >3 s).
- reward type used; location (indoor, garden, street, park).
- dog readiness: energy before (low/normal/high); stress flags seen (see §5); ended on success (y/n).
  Daily: walk minutes, sniff/search minutes, chew/puzzle (y/n), alone-time minutes and dog behaviour while alone (video check optional), toilet accidents (count + location), sleep quality (good/restless), pulling episodes.
  Per problem behaviour: frequency per week, intensity (1-5), distance-to-trigger at first reaction (m), recovery time (s). Show 2-week trend not single-day noise.
  Owner: who trained (member), mood/time-pressure note, reason for skipping (fixed list: time, tired, dog off, weather, forgot, other) [#16, #22].

## 5. Safety / welfare red flags (surface to owner; stop-and-review triggers)

- During session: yawning, lip licking out of context, turning away, freezing, whale eye, panting when not hot, shaking off, dropping food, refusing treats, trembling, escape attempts, avoidance of owner/equipment; any growl, snap, lunge, bite attempt [#41, #10 stress behaviours]. Rule: one signal = ease the criterion and take a break; >=2 or any aggression = stop session and flag.
- Single signals are context-dependent (lip licking before food is not stress); the app should ask context, not diagnose.
- Alone-time: vocalising, destruction, soiling, drooling, pacing when left alone -> separation-related problem pathway and veterinary/behaviour professional referral [#18].
- Sudden behaviour change, regression of house-training, new aggression or restlessness -> veterinary check first.
- Children and dogs: any bite or growl history with child -> professional referral; no training tasks for children [#35].
- Aversive tools or punishment reported -> educational prompt, no endorsement [#12].
- Over-exercise in growing large-breed puppies; brachycephalic or heat; senior dogs with mobility issues -> vet-aligned limits. [#42 low]
- Avoid medical claims; this program is training/enrichment not treatment.

## 6. Open questions

1. Exact minutes of exercise by breed group/size/age with evidence (none located); needs Kennel Club / vet consensus sources or a clearly labelled heuristic.
2. Real-world owner completion rates for dog-training exercises per week: no direct figures found; Dogs Trust class dropout (24-43%) and human adherence (20-64%) are proxies. App telemetry should be used to calibrate.
3. Is there an evidence-based minimum effective dose (sessions/week) per skill? Demant suggests weekly can match daily; need replication and pet-dog field data.
4. Multi-person/multi-dog household consistency: any controlled evidence?
5. Housetraining and crate-training protocols: still need peer-reviewed or veterinary-behaviourist guideline sources (AVSAB/ASPCA handouts).
6. Verify numbers I could only see via secondary summaries: Demant 2011, Duranton & Horowitz 2019, Lally 2010, Gollwitzer & Sheeran 2006, Rehn & Keeling 2011, Takeuchi 2000, Daniels 2023 (PDF not text-read), Blackwell 2008 (see LINKS.md).
7. Whether the Bleuer-Elsner & Masson crate survey has a published peer-reviewed version.
8. Validated owner-facing welfare-signal checklist with accepted sensitivity (Purdue chart is guidance, not validated).
