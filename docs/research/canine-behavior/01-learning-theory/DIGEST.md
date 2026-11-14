# 01 Learning theory: deep-read digest

Scope: all 19 files in `sources/` and all 47 rows of `LINKS.md`, checked against `NOTES.md` and `../README.md`. Rule IDs (R1-R27) are from NOTES.md.

**Read status (updated after the follow-up pass).**

- **Full text, local file (18 rows, 19 files):** rows 1, 5-10, 20, 21, 31, 38-45. Reference lists and big tables were skimmed. The VdC PMC html duplicates the PDF plus the peer-review history.
- **Full text via WebFetch summary (3 rows):** 19 Kis, 24 Lazaro, 33 Thrailkill. These are summaries of the page, not verbatim reads.
- **Partial full text (1 row):** 2 Herron (abstract, methods, limitations from the PDF).
- **Abstract or secondary only (25 rows):** 3, 4, 11-18, 22, 23, 25-30, 32, 34-37, 46, 47. I tried the open copies (PMC, author and institutional repositories, Europe PMC, CONICET, HAL, core.ac.uk, Illinois State). They were paywalled, 403/404, or bot-blocked, so no full text was obtainable. Section 1b lists what each abstract or secondary source supports.
- Row 47 (AKC web article) was read in full; it is a web article, not a study.

---

## 1. Per-source notes

### Local sources, read in full

**Hiby, Rooney & Bradshaw 2004, Anim Welf 13:63-69.**

- Design: owner questionnaire (26 items), cross-sectional, UK. 600 distributed, 364 returned (61%), **326 analysed** (the rest were incomplete or the dog was under 1 year). Dogs were 1-15 years old. Owners were recruited at dog-walking sites plus vet and pet-store pick-up.
- Methods: owners reported how they trained 7 tasks, rated obedience 1-5 on 8 items, and ticked 16 problem behaviours (reduced to 13).
- Results:
  - Owners used vocal punishment 66%, physical punishment 12%, praise 60%, food 51%, play 11%.
  - Obedience vs reward frequency: **rho = 0.26, p < 0.01**. Obedience vs punishment: ns.
  - Problems vs punishment frequency: **rho = 0.17**, p < 0.01 in the Results text but p < 0.001 in the abstract. The paper is internally inconsistent. Problems vs reward: ns.
  - Strategy groups: 20.2% reward-only, 9.8% punishment-only, 60.4% mixed, 9.6% miscellaneous. Obedience differed (Kruskal-Wallis p < 0.05): reward-only highest, then mixed, then punishment-only, and "miscellaneous" lowest.
  - Reward-only dogs had the lowest "current over-excitement" (p < 0.01). Punishment groups had more separation-related problems (p < 0.001).
  - Per-task: play beat other methods for "leave/give up object" (p < 0.01), praise for heel (p < 0.05), an alternative chew object for chewing (p < 0.05). For no task was punishment the best method.
- Limitations: self-report and correlational. The authors say causation is unknown (owners of obedient dogs may choose rewards). "Punishment" includes vocal reprimand, lead tug and sending the dog out. The effect sizes are small.
- Engine: supports R1 (weak-moderate) and R5 (play/praise work for some tasks). Contradicts nothing.

**Casey et al. 2021, Sci Rep 11:19023.**

- Design: matched-pair judgement-bias test, one home visit per dog. 113 tested, 100 analysed (**50 pairs**, aversive ≥2 methods vs none). Matched on breed, age band and sex/neuter status. Dogs were 6 months to 12 years old; dogs with human-directed aggression were excluded.
- Groups were defined by owner report of ≥2 listed tools or methods (citronella, e-collar, pet corrector, smacking, water pistol, choke chain, rattle can). Both groups also used rewards.
- Results:
  - Latency was longer to all three ambiguous locations in the aversive group.
  - Significant only at the middle (Z = -2.380, P = 0.017) and near-positive (Z = -2.447, P = 0.014) locations. There was no multiple-comparison correction.
  - No group difference in trials to criterion (P = 0.713) or in latency to the positive or negative location.
- Limitations (authors'): correlational; frequency and recency of use were not recorded; reward-only owners may have used unlisted aversives; the test had no aversive component.
- Engine: supports R1 and R4 (moderate).

**China, Mills & Cooper 2020, Front Vet Sci 7:508.**

- Design: field comparison of 63 dogs with off-lead problems (mostly chasing; 81%). Three groups of 21: e-collar by manufacturer-nominated trainers (EC), the same trainers without e-collars (C1), and APDT reward-focused trainers (C2). EC and C1 were randomly allocated, apart from 2 owner-requested swaps. **C2 was trained 4 months later, at a different site, by different trainers.**
- Dose: 2 sessions/day for up to 5 days, about 28.5 min/day. Data come from days 1, 3 and 5. Day 5 was run by owners (per Sargisson).
- Results:
  - Obeyed on first "Come": C2 82.5% vs 71.0% (EC) and 72.4% (C1), p = 0.015.
  - Obeyed on first "Sit": C2 83.5% vs 76.8% and 72.7%, p = 0.036.
  - Disobeyed: ns, 2-5% in all groups.
  - Latency: "Come" about 1.24 s overall, "Sit" about 1.64 s; group differences were small. The text prints F(2,114) = 5.89 with p = 0.04, which is a typo.
  - C2 used far fewer hand and lead signals, and about 5 times more food (previous report).
- Limitations: Sargisson & McLean add semi-random assignment, a non-repeated-measures analysis and multiple-testing problems. Training was close to the trainer (<1 m, about 70% of the time, on lead), so it says little about real off-lead recall. The "unnecessary suffering" conclusion is not tested.
- Engine: supports R1; efficacy equal or better for reward-focused training. Contradicts nothing.

**Sargisson & McLean 2021, Front Vet Sci 8:629746 (commentary).**

- Argues that China et al.'s conclusions go beyond the data. Specifics: C2 differs in time, place and trainer; day 5 was owner-run and the two key results appear to depend on day 5; the stats are inappropriate and a Bonferroni correction would probably remove the first significant result in Table 5; no baseline compliance was recorded; and the results say nothing about predation control.
- Engine: caps China 2020 at "supportive, not definitive". Also a reminder that some professionals defend e-collars for predation, which is outside engine scope.

**Cooper et al. 2014, PLoS ONE 9:e102722.**

- Design: preliminary study of 9 dogs, then the same 63-dog study as China, with welfare outcomes. **2 × 15 min/day for 4-5 days.**
- Preliminary study: 8 of 9 dogs were trained by e-collar at high settings without warning cues. They showed 13 yelps and 5 whines, tense 50% of the time (vs 10% before), and salivary cortisol up from sample 1 to sample 2 (T = 2.89, p = 0.042).
- Main study (Benjamini-Hochberg FDR corrected):
  - Group A (e-collar) was **more tense than Group C (p = 0.007)** and yawned more.
  - Panting and yelping were more frequent in A but ns, driven by a few dogs.
  - **Salivary and urinary cortisol: no group difference.** Group C salivary cortisol was higher than B (p = 0.001) in both pre- and post-training samples.
  - **Owner-rated efficacy:** 88.5-91.8% reported improvement, with no group difference. Owner confidence in continuing: 100% (C), 94.7% (B), **76.2% (A)** (p = 0.016).
- Limitations: same group-C confound as China; only 4 trainers; efficacy was owner-reported only; sample not powered for small effects.
- Engine: supports R1 modestly. The effect on welfare indicators is small when "best practice" e-collars are used. It does not prove harm in all cases.

**Vieira de Castro et al. 2020, PLoS ONE 15:e0225023 (PDF and PMC html).**

- Design: quasi-experimental, 7 schools near Porto. **92 dogs**, mean age 11.9 months, attending less than 2 months, free of aggression and fear problems. Groups:
  - **Reward n = 42** (3 schools, 0% aversive techniques).
  - **Mixed n = 22** (2 schools, 22% and 37% intended aversive techniques).
  - **Aversive n = 28** (2 schools, 76% and 84%).
- Measures: first 15 min of 3 sessions on video (265 videos); saliva at baseline and 20 min post-training; cognitive bias test (79 started, 73 completed).
- Stress behaviours (mean count, Aversive vs Reward):

| Behaviour | Aversive | Reward | Effect   |
| --------- | -------- | ------ | -------- |
| Lip lick  | 55.90    | 4.11   | d = 3.91 |
| Yawn      | 2.30     | 0.28   | d = 1.37 |
| Crouch    | 3.56     | 0.59   | d = 1.10 |
| Body turn | 3.14     | 0.39   | d = 1.77 |

- Mixed vs Reward: lip lick 17.84 vs 4.11 (d = 1.99, p < 0.001); tense state p < 0.001 (d = 1.72); panting p = 0.042.
- Cortisol rise (post - baseline): Aversive > Reward (U = 107, p = 0.003). Mixed vs Reward ns (p = 0.183). **Only 31 dogs were assayed (8 Aversive, 8 Mixed, 15 Reward)**, so power is very low. Baseline cortisol was equal across groups.
- Bias test: Aversive slower to all bowls (t = 2.6, p = 0.032). Mixed vs Reward ns.
- Limitations (authors and reviewers):
  - Not randomized. Groups differed in dog age, FCI breed group, age at separation from the mother, owner gender, children in the home and how the owner chose the school.
  - Volunteer bias. Efficacy not measured.
  - 76% of videos were coded by the one unblinded author.
  - The "intended" aversive label is not proven to punish.
  - One Aversive school used only **petting** as its reward and had the highest stress scores. The authors suggest low-value rewards plus aversives is the worst case.
- Engine: supports R1, R4, R5 (reinforcer value matters). Note that "Mixed" being harmless is not supported (stress behaviours up) but not proven harmful on cortisol or bias either.

**Fernandes, Olsson & Vieira de Castro 2017, Appl Anim Behav Sci 196:1-12 (postprint).**

- Design: literature review. Web of Science search, 913 hits, **14 articles** (9 direct observation, the rest owner-report). It deliberately reviewed only statistically significant findings.
- **Conclusion:** "the evidence at present is not as clear as some advocates in the contemporary dog training discussion claim"; "limited scientific evidence." Aversive methods "generate stress at some level" but "further studies are needed."
- Efficacy: 3 studies favour reward (Blackwell 2012, Haverbeke 2010, Hiby 2004), 1 opposite (Salgirli 2012), 1 no difference (Cooper 2014).
- Welfare: 3 of 4 head-to-head studies show more stress with aversives. Shock-collar studies conflict (Christiansen 2001 and Steiss 1997 found no difference).
- Explicitly disagrees with Ziv 2017's stronger conclusions.
- Engine: supports a precautionary R1, **not** "strong convergent" evidence.

**Kutsumi et al. 2013, J Vet Med Sci 75:141-149.**

- Design: quasi-experimental, 142 dogs recruited via the author's SIRIUS school. Groups: PC puppy class (n = 44; 1 h/week × 6 weeks), PP single puppy party (39), AC adult class (27), NC no class (32).
- PC puppies were **10-18 weeks old at class start with 2 DHLPP vaccinations**, using Dunbar's force-free methods. Dogs were tested at home when **6-36 months old (means 17.6-23.8 months)**.
- Results (MANOVA, Bonferroni):
  - Response to commands: PC > PP and NC (P < 0.01); AC > PP (P = 0.03) and NC (P < 0.01). AC (started at 5 months-2 years) matched PC.
  - Positive response to strangers: PC > AC (P = 0.04) and NC (P = 0.02); PC vs PP trend (P = 0.07).
  - **C-BARQ (15 factors): no significant group differences.** The abstract's "may help prevent behavioural problems" is not supported by C-BARQ.
  - Separation, owner recall and novel-stimulus factors: ns.
- Limitations: self-selected, unrandomized, author-run school (conflict of interest), small cells, one behaviour test developed by the authors.
- Engine: weak support for puppy classes (R25 context); also shows adult classes teach commands equally well. It does not support "start at 7-8 weeks".

**Feuerbacher & Wynne 2012, JEAB 98:105-129 (PMC html).**

- Design: 5 single-subject experiments, nose-touch operant, food (about 10 mm piece) vs 4 s petting and verbal praise vs extinction. About 38 animals: shelter dogs 9 + 6 + 7, owned dogs 6, hand-reared wolves 9. Shelter dogs had been fasted more than 14 hours in most cases.
- Results (median nose touches per session):
  - Experiment 1: food **15** vs social **3** (cap of 15). 5 of 9 dogs were clearly food-driven, 1 (Dog S) was equal, 3 responded low and variably.
  - Experiment 2: 18 vs 4 vs extinction 3.
  - Owned dogs: 24 vs 1.5 (extinction 2).
  - Wolves: 24 vs 0 (extinction 0).
  - Twelve social sessions did not raise social responding (Experiment 4).
- Limitations: "social" was petting plus praise combined. Brief 4 s interaction, one operant, small n, no concurrent choice. Social could be a weak reinforcer or satiate fast, and the authors cannot tell which.
- Engine: supports R5 (food > petting+praise) with a large individual variability caveat. It does not isolate "praise alone".

**Feng, Howell & Bennett 2017, Pet Behav Sci 3:1-18.**

- Design: qualitative content analysis. **25 sources (13 trainer interviews, 5 websites, 7 books)**. Strongly pro-clicker sample (8 of 13 interviewees identified as clicker trainers).
- Findings:
  - Trainers recommend the signal for new behaviours; many drop it once learned.
  - Verbal markers are widely used instead of clickers because they are easier to carry.
  - Recommended pre-conditioning pairings range from "two or three" to "100-200", though Int13 called 100-200 "a gross overestimation". Some skip loading entirely.
  - Applied studies conditioned with up to 20 pairings (Smith & Davis criterion: 10 consecutive trials or a maximum of 20).
  - Unpublished theses report: a 1 s food delay hurt (Browne 2015); a 50% click-to-food rate slowed learning and increased "noncompliance" (Wennmacher 2007); clicker beat verbal "good" in a nose-target task, 36 vs 59 minutes (Wood 2007).
- Engine: R10 pairing count "10-20" is not from this paper. Supports "every marker is followed by reward" (relevant to R13).

**Hakanen et al. 2020, Sci Rep 10:13774.**

- Design: online Finnish owner survey, about 13,700 dogs surveyed. Analysis sets: fireworks n = 9,613, thunder 9,513, novel situations 6,945, surfaces/heights 2,932. Logistic regression with FDR control.
- Results: less puppy socialisation (7 weeks to 4 months), fewer activities or training, living without other dogs, inexperienced owners and urban living were each linked to more non-social fear. Training or activities "seldom/never" vs weekly: OR 1.36 (thunder), 1.41 (fireworks), 1.84 (novel situations). Neutered dogs were more fearful (OR about 1.5 for noise). More than 3 h exercise per day was linked to more thunder fear.
- Limitations: cross-sectional, owner-reported, social-media sampling. Not a training-method study.
- Engine: context for lifestyle and socialisation modules; the direction of causation is unknown.

**AVSAB 2021 Humane Dog Training.**

- Position statement. Reward-based for all training, and "no evidence that aversive methods are more effective ... in any context."
- Avoid: pain tools (choke, prong, shock), intimidation (squirt bottles, shaker cans, shouting, staring, alpha rolls), physical correction (leash jerks), flooding. "The learner must always feel safe and have the ability to 'opt out'."
- Refer aggression to a vet, DACVB or CAAB. Do not treat medication as a last resort.
- It correctly summarises Hiby (reward-only > mixed > aversive-only for obedience). Its own caveat: survey studies cannot separate cause from correlation.
- Engine: R1, R2, R3, R4.

**AVSAB 2008 Puppy Socialization.**

- The first three months are the primary window. Socialization before full vaccination should be "standard of care".
- Classes can start at **7-8 weeks** with at least one vaccine set **at least 7 days** before the first class plus a first deworming.
- Avoid dog parks and areas with dogs of unknown vaccination status. Do not force fearful puppies; seek veterinary guidance.
- It lists praise, petting, play and treats as rewards.
- Engine: R25 (high).

**AVSAB dominance statement (file `avsab-dominance-2008.pdf`).**

- Rejects dominance theory. Behaviours owners want to change are mostly accidentally reinforced. Confrontational techniques often elicit aggression (cites Herron 2008). Refer only to trainers who use learning theory.
- The text cites Yin 2009, so the file is probably a later revision than 2008 (the LINKS year may be off).

**AAHA 2015 Behavior Management Guidelines (JAAHA 51:205-221).**

- Take-home: "culture of kindness"; avoid forced restraint and punitive training. Opposes aversive techniques (prong, choke, cattle prods, alpha rolls, dominance downs, shock, starving, beating).
- "**Punishment should not be used in aggression cases**"; **aggression must never be referred to a trainer for primary treatment**; refer deep bites and bites to immunocompromised people. "Flooding is never recommended."
- Learning theory (in a short list): "New behaviors are learned best if they are rewarded each time they occur. After a behavior has been acquired, it is best maintained if it is rewarded randomly and intermittently." This supports R12 and R13 as expert consensus.
- Socialization: "no medical reason to delay puppy classes ... until the vaccination series is completed" if exposure to sick animals is prohibited. It is less strict than AVSAB. Forced exposure of a fearful puppy "sensitizes". Separation anxiety is a "behavioral emergency". Reports that 10% of puppies fearful at 8 weeks were still fearful at 18 months.
- The document's own definitions of negative reinforcement (it gives an example of withholding attention) are wrong; do not quote them.

**CCPDT Position Statement on Behavior Change Procedures (adopted 11/20/25).**

- Endorses reinforcement-based strategies as primary. The Humane Hierarchy is mandatory for certificants: health, antecedents, management, positive reinforcement first.
- **It permits positive punishment and negative reinforcement in documented safety cases**, with conditions: less intrusive options documented with data, management judged riskier, and a conditioning process.
- Quote: "in specific situations, studies have demonstrated that the use of negative reinforcement and positive punishment can contribute to improved outcomes related to safety and long-term welfare."
- Engine: R1 is a stricter product policy than CCPDT. Needs to be stated as a policy decision, not as professional consensus.

**IAABC LIMA position + Humane Hierarchy + Friedman article (`iaabc-position-lima.pdf`).**

- Hierarchy: 1 health/nutrition/physical; 2 antecedents; 3 positive reinforcement; 4 DRA; 5 negative punishment, negative reinforcement or extinction (unordered); 6 positive punishment.
- Level 5 "may occasionally be the ethical, effective choice"; level 6 is "rarely necessary".
- LIMA "does not justify punishment in lieu of" reinforcement and does not justify e-collar, choke or prong use in place of positive reinforcement strategies.
- Positive reinforcement is "the first line"; offer the learner "as much control and choice as possible".
- The PDF includes Friedman's article "What's wrong with this picture? Effectiveness is not enough" (no journal or year is printed in the file).
- **`iaabc-lima.html` is a 404 "Page Not Found" page. It is not a source.**

### Fetched or secondary sources

**Kis et al. 2017, Sci Rep 7:41873 (WebFetch of PMC5292958).**

- Experiment 1: 15 dogs; 3 h of polysomnography after learning new commands. Non-REM delta rose (t = 2.94, p = 0.011); retest improved (**t(14) = 3.83, p = 0.002**).
- **Experiment 2: 53 dogs in four 1-hour groups** (sleep in car n = 14, walk n = 14, learn unrelated task n = 12, play with Kong n = 13). Occasion × condition χ²(4) = 14.4, p = 0.006.
  - **At the 1-hour retest no benefit appeared for sleep or walk.** The play group got worse (p < 0.001). The learn group showed no improvement at all.
  - Improvement appeared only at the **long-term test (about 7.6 days)** for sleep, walk and play. The learn group never improved.
- Limitations: Experiment 1 N = 15 with borderline correlations; Experiment 2 sleep was not recorded; all dogs slept at home that night, which may confound long-term results; different intervals across experiments.
- Engine: R18 is supported only for "no new unrelated skill within 1 h" (interference). "Sleep, walk or play" is not supported (play was worse).

**Lazaro et al. 2023, Animals 13:3073.**

- 10 pet dogs aged 11 months to 8 years. Paired-stimulus preference assessment of 6 foods and 6 leisure items, **15 trials per item**. Then an ABCABC reinforcer test and a progressive-ratio phase.
- **9 of 10 dogs responded more for food** (only 7 of 10 significantly). Paired t(30) = -6.32 (pooled observations). Leisure items beat extinction for many dogs.
- Limitations: n = 10, convenience sample, single-operant (no concurrent choice), one food and one leisure item per dog, play lasted about 10 s.
- Engine: R5, R6.

**Thrailkill et al. 2016, Behav Process 129:44-53 (rats).**

- 32 female rats per experiment (Exp 3: 13 after dropouts). Partial reinforcement (10 of 30 trials) and longer search intervals raised persistence in extinction. Extinction followed the number of non-reinforced searches.
- Free "noncontingent" pellets had mixed effects.
- Engine: R13 at best low-evidence by analogy. It is not dog data.

**Herron, Shofer & Reisner 2009, Appl Anim Behav Sci 117:47-54.**

- 140 owners (64% response) at a **referral behavior clinic**; a 30-item survey of past interventions.
- Aggressive response (share of dogs on which the method was tried): hit or kick **43%**, growl **41%**, forced release of an item 39%, alpha roll 31%, stare-down 30%, dominance down 29%, grab and shake 26%. Dogs presenting with aggression to family members responded more to alpha roll and yelling (P < 0.001).
- Limitations (authors): referral population only; no time sequence; subjective effect ratings.
- Engine: R1 (aversives provoke aggression in clinic dogs). Resolves the "exact % varies" note.

**Abstract or secondary only:**

- **Meyer & Ladewig 2008:** 18 beagles. Once-a-week group needed fewer sessions to criterion (6.6-6.7) than the 5-times-a-week group (9.0); the trainer was not blind to group (secondary).
- **Demant et al. 2011:** 44 beagles (per the popular press). Four schedules crossing frequency (1-2 per week vs daily) with duration (1 session vs 3 in a row). **A frequency × duration interaction was reported**, and retention lasted at least 4 weeks regardless of schedule. The direction "one per day beats three in a row" and "spacing did not help retention" come only from secondary summaries.
- **Bentosela 2009:** successive negative contrast, a small sample (about 13 dogs, 7 shifted). A 2016 replication (Riemer et al.) failed to find the effect, per secondary sources. The specific foods (liver to pellets) could not be confirmed.
- **Jakovcevic 2013:** 16(1):19-34. Gaze task with inaccessible food (extinction). The abstract does not give dog extinction-burst data.
- **Chiandetti 2016:** 51 dogs (17/17/17: clicker, spoken "Bravo", food only), bread-box task. Comparable learning and generalisation. The "8/10 consecutive" criterion in NOTES could not be verified.
- **Feng 2018:** clicker plus food and food-only were equivalent in a novice tricks course, per secondary sources.
- **Smith & Davis 2008:** no acquisition difference with a briefly delayed food reward. The clicker group extinguished more slowly (log10 trials 1.6 vs 1.4, P < 0.001).
- **Protopopova & Wynne 2015:** the response-independent treat approach cut dogs with undesirable in-kennel behaviour by **68%** from baseline in a shelter-wide run. The abstract does not describe an effect-size comparison.
- **Ziv 2017:** 17 studies. Concluded aversive methods jeopardize welfare and that there is no evidence that they are more effective; notes small samples, no effect sizes and possible coding bias.
- **Vicars 2014:** 8 dogs. The paired-stimulus preference ranking predicted reinforcer efficacy; concurrent testing showed position bias.

**Not accessed (no content read):** Blackwell 2008, Masson 2018, Schilder 2004, Rooney 2011, Deldalle 2014, Arhant 2010, Casey 2014, Feuerbacher 2014 and 2015, Feng 2016, Fugazza 2015, Fukuzawa 2005, Dinwoodie 2019, Pryor 1969, and the AKC pages.

---

## 1b. Follow-up pass: abstract-only and secondary sources

Every item here is **abstract or secondary only** unless it says otherwise. None could be read as full text.

- **Meyer & Ladewig 2008 (row 17).** 18 laboratory beagles, 9 trained once a week and 9 five times a week, clicker and shaping of one target behaviour (a front paw on a mousepad). Weekly dogs needed significantly fewer sessions (6.7 vs 9.0) and tended to have higher success rates at each step. Five-times-weekly dogs finished in significantly fewer days. Daily dogs made more unreinforced repetitions. The trainer was not blind to group (secondary). Whether dogs were randomly assigned is not stated in the abstract. Engine: supports "fewer, spaced sessions are more efficient per session"; says nothing about pet dogs or minutes per session.
- **Demant et al. 2011 (row 18).** 44 laboratory beagles in four groups with the same total number of sessions. Tasks: jump into a basket, sit, stay while the trainer walks away and returns. Once or twice weekly short sessions did much better by the final session than the other short-session groups; the **daily long-session group (3 sessions in a row) did worst**; a frequency x duration interaction is reported. Retention was equal at 4 weeks regardless of schedule, so spacing helped acquisition, not retention. Exact session counts and lengths are not in any source I could open. Engine: supports "no 3 consecutive sessions on one skill" and "spaced beats daily massed" for lab beagles on simple tasks (R15).
- **Bentosela et al. 2009 (row 26).** First demonstration of successive negative contrast in dogs, interspecific gaze task. About 13 dogs (7 shifted, 6 unshifted, per a secondary source). A 2016 replication (Riemer et al.) reportedly did not find the effect. The specific foods shifted could not be confirmed. Engine: R7 stays Low.
- **Jakovcevic et al. 2013 (row 27).** The abstract describes extinction of a gaze-at-experimenter response when dogs tried to reach inaccessible food. Compared with the last training trial, dogs in extinction showed more withdrawal, orienting to the side, lying down, moving, sniffing and vocalising. No burst size or duration is reported in the abstract. Engine: supports "expect frustration behaviour when reward is withheld" (R14); gives no numbers.
- **Chiandetti et al. 2016 (row 28).** 51 dogs, 17 per group (clicker, spoken "Bravo", food only), bread-box opening, learning and generalisation tested. The abstract fragments say comparable learning and generalisation. One secondary summary says clicker dogs acquired the initial task in fewer attempts, so the null is not fully clean. The "8/10 criterion" is not in any source I could open.
- **Feng et al. 2018 (row 29).** Clicker plus food vs food only in a novice tricks course; little functional difference (blog and thesis summaries). Cautions that it may not hold for competition or working dogs.
- **Feng, Howell & Bennett 2016 (row 30).** Review. Of five studies comparing a clicker-type signal plus food with food alone, only one found faster learning. Concludes the signal probably acts as a conditioned reinforcer, with marking and bridging properties possible. No dog numbers.
- **Smith & Davis 2008 (row 32).** No difference in trials or time to criterion (food was briefly delayed after the click). Clicker group extinguished more slowly (log10 trials 1.6 vs 1.4, P < 0.001). Younger dogs learned faster than older dogs.
- **Fugazza & Miklosi 2015 (row 35).** Do-as-I-do beat shaping/clicker for object-related actions within the time limit; no difference for simple body movements (blog summaries). Cue memory may be better after social learning. Not a test of the clicker as a signal.
- **Fukuzawa, Mills & Cooper 2005 (row 36).** 6 dogs trained to sit and come to recorded commands. Altering the sound of the commands sharply reduced performance; the type of alteration mattered for "sit" but not "come". Engine: small n; supports using distinct, consistent cue words (R24 cue transfer).
- **Protopopova & Wynne 2015 (row 34).** Experiment 1 compared response-independent treats against an increasing-interval DRO and a control; Experiment 2 applied the response-independent method shelter-wide and the number of dogs with undesirable in-kennel behaviour fell 68% from baseline. The simple method performed about as well as DRO. Not a pet-dog training study.
- **Vicars et al. 2014 (row 25).** 8 dogs, 6 foods. The paired-stimulus preference ranking predicted progressive-ratio reinforcer efficacy for all 8; the concurrent assessment produced position bias. Supports R6, with n = 8.
- **Ziv 2017 (row 4).** 17 studies; aversive methods risk physical and mental health; no evidence that positive punishment beats reward; limits are small samples, no effect sizes and possible coding bias. Recommends positive reinforcement.
- **Feuerbacher & Wynne 2014 (row 22).** Concurrent choice, five 5-minute sessions per dog. Dogs preferred food when it was readily available and shifted as food thinned. Context, familiarity of the person and deprivation from social contact changed how much petting was chosen. A 2022 follow-up says owned dogs often did not approach the petter even with no food (secondary).
- **Feuerbacher & Wynne 2015 (row 23).** Eight 3-minute sessions per comparison. Both shelter and owned dogs stayed closer for petting than for vocal praise; **vocal praise produced as little proximity-seeking as no interaction**; no sign of satiation for petting. The authors suggest petting is unconditioned and praise must be conditioned. Supports R5.
- **Blackwell et al. 2008 (row 3).** Owner survey. Training method was linked to the number of undesirable behaviours and to attention-seeking, fear/avoidance and aggression scores; fear of other dogs was more likely with any punishment; 16% of owners used only positive reinforcement; dogs trained at home had more problems than dogs in classes. I could not confirm the sample size.
- **Masson et al. 2018 (row 11).** Two different 2018 JVB papers share the author name. The ESVCE position-basis paper (JVB 25:71-75; Masson, de la Vega, Gazzano, Mariti et al.) is a discussion of pros and cons and ends firmly against e-collars. The French owner survey (Masson, Nigron, **Gaultier**, JVB 26:48-60) had n = 1,251 with 26% (330) using e-collars and urged regulation.
- **Schilder & van der Borg 2004 (row 12).** 16 shocked guard dogs vs 15 controls (German Shepherd and Malinois types); 107 shocks across 32 dogs in total (secondary). Shocked dogs showed more lip licking and lower ear carriage off the training ground. One review notes 7 of 32 showed no fear or pain at the shock. Behaviour only; cortisol was deliberately not used.
- **Rooney & Cowan 2011 (row 13).** 53 owner-dog pairs, filmed in standard tests (Fernandes lists N = 52). More reported punishment: dogs less likely to approach a stranger; more physical punishment: less play. More reported reward: tended to do better on a novel task. Patient, playful owners: better task performance. Correlational. **It did not measure judgement bias or "pessimism"**.
- **Deldalle & Gaunet 2014 (row 14).** Two schools, one positive-reinforcement and one negative-reinforcement. The negative-reinforcement school's dogs showed lower body posture and more stress signals; the positive school's dogs were more attentive to the owner. No difference in avoidance. Sample reported as 26 vs 24 in one summary (unconfirmed).
- **Arhant et al. 2010 (row 15).** 1,276 questionnaires. Owners of small dogs were less consistent and did less training and play (P < 0.001). More consistency, training and play went with better obedience in small dogs. **The punishment-anxiety link held for small dogs only.**
- **Casey et al. 2014 (row 16).** About 4,000 returned UK questionnaires (of about 15,000). Aggression in three contexts: about 7% at visitors to the home, 5% to strangers outside, about 3% to family. Most dogs showed it in one context only. Punitive training was linked to 2.9 times the risk of aggression to family. Neutered females had lower risk in all three contexts. Authors caution against judging individuals by breed.
- **Dinwoodie et al. 2019 (row 37).** Online owner survey of about 3,201 owners and 5,018 dogs (counts vary by source). Reported prevalence of any behaviour problem about 85%. Sex, neuter status, origin and lineage mattered. Context for referral triage only.
- **Pryor, Haag & O'Reilly 1969 (row 46).** The PMC copy is PMC1338662 (the earlier fetch returned the wrong article). Only the abstract and a footnote are readable. Two rough-toothed porpoises; a different response to the same stimuli was reinforced each session; one session abruptly produced four new response types under a "novel only" criterion. Holth (2012) argues the report does not clearly show that novelty itself was reinforced. Not dog data.
- **AKC "3 Ds" article (row 47), read in full.** Work on one D at a time and combine them only after each is mastered; duration first, then distance, distraction last; duration starts at about 1 s and grows by 1 s; for long holds reward during the hold (e.g. every 20 s in a 60 s sit); no success percentage is given and **no research is cited**. It does not state the 80% rule, a 20-50% increment or a "reset the others" rule.

---

## 2. Corrections to NOTES.md, LINKS.md and README.md

1. **LINKS row 43 / NOTES provenance: `sources/iaabc-lima.html` is a 404 page** ("Page Not Found"). The real content is in `iaabc-position-lima.pdf`, which has the LIMA statement, the Humane Hierarchy and Friedman's article. **Row 45 ("Friedman 2010 not obtained") is wrong**: the article is in that PDF (no journal or year printed in the file). Fix: mark row 43 as the PDF only and row 45 as "read, in PDF".
2. **LINKS row 44 / NOTES §1 "Hierarchy ... CCPDT, IAABC ... avoid aversive equipment."** CCPDT (adopted 11/20/25) actually says: "in specific situations, studies have demonstrated that the use of negative reinforcement and positive punishment can contribute to improved outcomes related to safety and long-term welfare." It permits them after documented use of the hierarchy. IAABC Level 6 is "rarely necessary", not "never". Fix: say the engine's no-aversives rule (R1) is a stricter product policy at the AVSAB end, not the credentialing-body consensus.
3. **NOTES §1 "Reviews/bodies ... Fernandes 2017 ... converge: use reward-based methods; aversives unnecessary."** Fernandes writes: "the evidence at present is not as clear as some advocates ... claim" and "limited scientific evidence". It argues against Ziv's conclusions. Fix: remove Fernandes from "converging"; state it as the cautious review. Also LINKS row 9 "Read ABS" should be FULL.
4. **LINKS row 9 authors.** "Fernandes (Guilherme)" should read "Guilherme Fernandes J, Olsson IAS, Vieira de Castro AC" (14 articles, significant results only).
5. **NOTES §1 "Reward-based vs aversive ... obedience ... (Hiby 2004, n=364)".** 364 were returned but **326 were analysed**. Effect sizes are rho = 0.26 and 0.17. The paper's abstract says p < 0.001 for punishment-problems, but its Results text says p < 0.01 (internal inconsistency).
6. **LINKS row 38 Hakanen.** Page/article number is **10:13774, not 10:13516**. The survey had about **13,700 dogs**, with analysed samples of 2,932-9,613 (not ">~6000"). "Read: not read" is outdated (read now).
7. **LINKS row 19 / NOTES "Kis 2017: Retest after sleep/walk improved vs baseline."** In Experiment 2 (n = 53), **there was no improvement at the 1-hour retest after sleep or walk**, the Kong-play group got worse, and gains appeared only at the roughly 7.6-day test. The 3-hour EEG experiment (n = 15) did show improvement. NOTES R18 ("sleep/walk/play for ~1 h") should drop "play".
8. **LINKS row 20 / NOTES "classes at ~4 months improved command and stranger response."** Classes started at 10-18 weeks (after 2 vaccinations) and dogs were tested at 6-36 months. C-BARQ showed **no** group effect; the abstract's "prevent behavioural problems" is unsupported. The adult class (AC) matched PC on commands. Add the conflict of interest (author-run school) and the PP, AC and NC cell sizes (39, 27, 32).
9. **LINKS row 8 Casey.** All three probes were slower in the aversive group, but only 2 of 3 were significant (middle and near-positive), without multiple-comparison correction. Sample is 50 pairs.
10. **LINKS row 7 VdC.** Cortisol was assayed in **31 dogs only** (8/8/15), so "cortisol not significantly different in Mixed" is underpowered. One aversive school used only petting as reward (confound). Full title: "Does training method matter? Evidence for the negative impact of aversive-based methods on companion dog welfare."
11. **LINKS row 10 Cooper 2014 / NOTES "E-collar groups showed more stress indicators."** Only tension and yawning differed from Group C after FDR correction. Cortisol did not differ for the e-collar group (it did between C and B). Efficacy was owner-reported only (88.5-91.8% improved; no group difference). Training dose was 2 × 15 min/day for 4-5 days.
12. **LINKS rows 5 and 6.** China 2020: C2 (reward) was non-randomized, trained 4 months later, with owner-run day 5. The printed F(2,114) = 5.89, p = 0.04 is a typo. Both should be "read in full".
13. **LINKS row 26 / NOTES R7 "dogs downshifted from liver to pellets refused food."** Not verified (could not confirm foods). n was about 13 dogs and a 2016 replication failed to find the effect (secondary). R7's "negative contrast" evidence should be downgraded to low.
14. **LINKS row 2 / NOTES "~25-43%; exact figures vary by summary."** Confirmed in the paper abstract: hit/kick 43%, growl 41%, forced release 39%, alpha roll 31%, stare-down 30%, dominance down 29%, grab jowls and shake 26%. n = 140 referral-clinic owners (64% response).
15. **NOTES R10 "10-20 pairings."** Not from Feng 2017 or Chiandetti (could not verify). Feng 2017 reports advice from 2-3 to 100-200 pairings. The 10-20 figure matches the Smith & Davis criterion (10 consecutive, max 20). Fix: tag it convention.
16. **NOTES R12/R13 sources.** AAHA 2015 directly states continuous reinforcement for acquisition and random, intermittent reinforcement for maintenance. Add AAHA as the source. For R13, Feng 2017 relays unpublished evidence that rewarding only 50% of clicks slowed learning: thin the behaviour-to-marker schedule, never leave a marker unrewarded.
17. **NOTES R14 "extinction burst ... AAHA 2015".** AAHA does not discuss extinction bursts. Only "punishment not for aggression" and referral apply. The burst warning has no source in this folder.
18. **NOTES R15 / README "never 3 consecutive sessions, ≥1 h gap" cites Demant.** The abstract says only that frequency × duration interacted and retention lasted at least 4 weeks. "One per day beat three in a row" could be verified only via a secondary summary. The "≥1 h gap" has no source (Kis: 1 h interference). Treat as low-medium.
19. **NOTES R16 / README "5-6 days/week" cites Meyer 2008.** Meyer compared 1 vs 5 sessions per week (weekly needed fewer sessions; daily finished in fewer calendar days). Nothing in the sources supports "5-6 days/week with 1-2 rest days". Convention.
20. **NOTES R17 / R19 cite "Chiandetti 2016 (8/10 criterion)".** Not verified from any source I could open. Drop the citation; the 8/10 rule is convention.
21. **NOTES R25 "classes from 7-8 weeks after ≥1 vaccine set ≥7 days earlier."** Correct for AVSAB 2008. AAHA 2015 is more permissive ("no medical reason to delay" if sick animals are excluded). Also add AAHA's warning that forced exposure of a fearful puppy sensitizes it.
22. **NOTES R2 "end session if dog disengages twice."** AVSAB says only the dog must be able to "opt out". The "twice" is convention.
23. **LINKS row 41 AVSAB dominance.** The text cites Yin 2009 and AVSAB 2007, so it is not a pure 2008 document. Check the year.
24. **README Evidence caveat.** Correct in spirit. Add: the aversive-vs-reward evidence is itself mostly correlational and moderate (Fernandes), so the "force-free only" rule rests on welfare precaution plus equal-or-better efficacy, not on proven harm.

25. **LINKS row 47 / NOTES R19, R20 "80% ... AKC".** The AKC article gives **no success percentage** and cites no research. Its increments are about 1 s of duration at a time, not 20-50%. Fix: R19/R20 numbers are convention with no source in this folder.
26. **LINKS row 46 Pryor.** The open copy is PMC1338662 (the earlier PMC link returned an unrelated paper). It is abstract-only and covers two porpoises. Holth (2012) disputes that novelty was directly reinforced. Fix: do not cite it as evidence for the shaping rules (R24).
27. **LINKS row 11 Masson.** "Masson, Nigron & Gaunet 2018, JVB 25:71-75" mixes two papers. The position-basis paper (25:71-75) has authors Masson, de la Vega, Gazzano, Mariti et al.; the French survey (26:48-60, n = 1,251, 26% used e-collars) is by Masson, Nigron and **Gaultier**. Fix the author list and cite them separately.
28. **LINKS row 13 Rooney & Cowan.** "More pessimistic/avoidant dogs (per AVSAB 2021 citation)" is not in the study. They measured stranger approach, play and a novel-task score in 53 owner-dog pairs, with no judgement bias. Only the Casey and VdC studies used judgement bias.
29. **LINKS row 15 Arhant.** "Harsh/inconsistent owner behaviour associated with problem behaviours across sizes" is wrong. The punishment-anxiety link held for small dogs only; consistency and engagement differed by size.
30. **LINKS row 16 Casey 2014.** "Aversive-training risk factor in older work" is vague. The paper reports about 4,000 returned questionnaires and punitive training linked to 2.9 times the risk of aggression to family members. Neutered-female finding confirmed.
31. **LINKS rows 17 and 18 (Meyer, Demant).** Both are lab beagles on simple tasks (paw on a mousepad; basket, sit, stay). Demant's daily 3-sessions-in-a-row group was the worst performer. Neither "RCT-like" nor the 6.7 vs 9.0 figure (abstract) is in doubt, but randomisation is not confirmed.
32. **LINKS row 27 Jakovcevic.** Not "title only": the abstract describes extinction of a gaze response and the frustration behaviours listed above, with no burst data. "Pages 19-?" should read 19-34.
33. **LINKS row 28 Chiandetti.** One secondary summary says the clicker group acquired the initial task in fewer attempts, so "all learned equally" is not certain. The 8/10 criterion remains unverified.
34. **LINKS row 22 and 23 Feuerbacher 2014, 2015.** Confirmed at abstract level. The 2015 result is stronger than NOTES states: praise produced as little proximity-seeking as no interaction.
35. **LINKS row 37 Dinwoodie.** Not "title only": about 3,201 owners and 5,018 dogs (counts vary by source), prevalence of any problem about 85%.

---

## 3. Evidence-graded rules for this domain

Confidence is high, medium or low. "Convention" means no study supports the number.

| ID        | IF / THEN                                                                                                                                                                                                         | Parameters                   | Sources                                                                                                                                                                                     | Conf.                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| R1        | Any dog or goal: emit only R+, negative punishment (sparingly), DRA/DRI/DRO, counter-conditioning, management, environment change. Never prong, choke, shock, spray, alpha roll, leash pop, flooding or shouting. | policy                       | AVSAB 2021, AAHA 2015, Herron 2009, VdC 2020, Casey 2021, China 2020. Note CCPDT and IAABC allow documented exceptions.                                                                     | High (as policy). Evidence for harm is moderate and correlational. |
| R2        | Always allow the dog to leave or decline. If the dog disengages or leaves 2 times in a session, end it.                                                                                                           | "twice"                      | AVSAB 2021 (opt out); the count is convention                                                                                                                                               | Med / convention                                                   |
| R3        | Bite history, severe fear, panic, self-injury, separation anxiety: no training-only plan; management plus referral. Aggression is never routed to a trainer as primary treatment.                                 | n/a                          | AAHA 2015, AVSAB 2021                                                                                                                                                                       | High                                                               |
| R4        | Past aversive tool use or fear of owner or equipment: add a "rebuild trust" module, lower initial criteria, new cues.                                                                                             | n/a                          | AVSAB 2021, VdC 2020 (cue itself becomes aversive)                                                                                                                                          | Med                                                                |
| R5        | Default reinforcer is small food. Petting, play and praise are secondary; use them for dogs that rank them high. Do not rely on praise alone.                                                                     | n/a                          | Feuerbacher 2012, Lazaro 2023, VdC 2020 (petting-only school had the highest stress), Hiby 2004, Feuerbacher 2015 (abstract: praise drew no more proximity than no interaction)             | High for food; Med-High that praise alone is weak                  |
| R6        | Per-dog reinforcer ranking: owner-run paired choices of 6 foods, 2-3 trials per pair (lab used 15 per item); keep top 3 foods and top 2 toys; re-run every 4 weeks or on disengagement.                           | 6 items; 2-3 trials; 4 weeks | Vicars 2014, Lazaro 2023                                                                                                                                                                    | Med; 4-week interval is convention                                 |
| R7        | Reward tier by distraction (1-2 T1/T2, 3 T2, 4-5 T3). Do not drop tier within a session.                                                                                                                          | tiers                        | convention; Bentosela 2009 not replicated                                                                                                                                                   | Low                                                                |
| R8        | Treats pea-sized, ≤10% of calories; health flags use part of ration.                                                                                                                                              | 10%                          | convention                                                                                                                                                                                  | Med / convention                                                   |
| R9        | Food refusal in 3 consecutive sessions: flag; stop the session on a single refusal.                                                                                                                               | 3                            | convention                                                                                                                                                                                  | Med / convention                                                   |
| R10       | Marker is optional; verbal "yes" by default, clicker as option. Pair 5-20 times, until the dog orients to the marker when it is sounded, then use. Food within about 1-2 s.                                       | 5-20 pairings                | Chiandetti 2016 (abstract), Feng 2017/2018 (secondary), Feng 2017 (advice varies)                                                                                                           | Med for optional marker; Low for pairing count                     |
| R11       | Reward within 1-2 s of the behaviour, at the criterion position.                                                                                                                                                  | 1-2 s                        | convention; unpublished 1 s-delay thesis (via Feng 2017)                                                                                                                                    | Med                                                                |
| R12       | New behaviour or criterion: reward every success (continuous).                                                                                                                                                    | 6-12 rewards/min             | AAHA 2015                                                                                                                                                                                   | Med; rate is convention                                            |
| R13       | Thin only after R19 is met: FR1, then FR2, then VR2-3, then VR3-5, steps ≤25%. Safety-critical skills keep high-value variable rewards. Never leave a marker unrewarded.                                          | 25% steps                    | AAHA 2015 (intermittent maintenance), Thrailkill 2016 (rats), Feng 2017 (unpublished 50% result)                                                                                            | Low-Med; parameters convention                                     |
| R14       | No extinction-only plan for self-rewarding or dangerous behaviours; pair with DRA and management. If aggression or self-injury appears, stop and refer.                                                           | n/a                          | AAHA 2015 (no punishment for aggression); burst warning unsourced                                                                                                                           | Med (policy); Low (burst content)                                  |
| R15       | Sessions per skill per day: 1-3. No more than 1 block per skill in a row. Keep ≥1 h gap. Length 3-5 min (puppy under 16 weeks, senior or fearful 2-3 min; experienced adults up to 5-10 min).                     | 1-3/day, 3-5 min, 1 h        | Demant 2011 (daily 3-in-a-row group worst, abstract/secondary), Meyer 2008 (weekly needed fewer sessions); China/Cooper (professional dose 2 × 15 min/day for 4-5 days); minutes convention | Frequency Med-Low; minutes Low                                     |
| R16       | Time budget T min/day: sessions = ceil(T/5), cap 3 per skill, 2-3 skills/day; puppies ≤15-20 min. T<5: one micro-session plus "reward calm in routine".                                                           | cap 3                        | convention                                                                                                                                                                                  | Low-Med                                                            |
| R17       | 10-20 rewarded reps per session; end on a success; stop if stress or disengagement, or <60% on the last 5 trials.                                                                                                 | 10-20, 60%                   | convention                                                                                                                                                                                  | Low                                                                |
| R18       | Do not start an unrelated new skill within 1 h after a session. Offer rest, sleep or a calm walk.                                                                                                                 | 1 h                          | Kis 2017 (Experiment 2: learning an unrelated task blocked gains; sleep/walk helped only at ~7.6 days)                                                                                      | Low-Med                                                            |
| R19       | Advance when success ≥80% over the last 10 trials in 2 consecutive sessions; hold at 60-79%; regress one step if <60% for 2 sessions; <40% or any stress flag: regress 2 steps and end the session.               | 80%, 60%, 40%                | convention only                                                                                                                                                                             | Med as engine logic, Low as evidence; **convention**               |
| R20       | 3 Ds: change one at a time, reset the others; order duration, distance, distraction; distraction graded 1-5; increments 20-50% (smaller for fearful dogs).                                                        | 20-50%                       | AKC article gives order only (duration, distance, distraction last) and 1 s duration steps; no % and no research                                                                            | Low / convention                                                   |
| R21       | 2 regressions at a step: halve the step or change environment/reinforcer first.                                                                                                                                   | halve                        | convention                                                                                                                                                                                  | Low-Med                                                            |
| R22       | Mark "reliable" only after ≥3 locations, ≥2 handlers, ≥2 times of day.                                                                                                                                            | 3×2×2                        | convention                                                                                                                                                                                  | Low / convention                                                   |
| R23       | Fluent = ≥90% in 3 sessions, latency ≤3 s, ≥2 contexts, on VR; only then fade cues or chain.                                                                                                                      | 90%, 3 s                     | convention                                                                                                                                                                                  | Low / convention                                                   |
| R24       | Lure simple positions; capture offered behaviours; shape novel or complex ones. Raise criterion after 3-5 successes. Drop the prompt after ≥5 successful pairings.                                                | 3-5; 5                       | AVSAB 2021 (names the methods); no comparative trials                                                                                                                                       | Low-Med                                                            |
| R25       | Puppy classes or socialization from 7-8 weeks only after ≥1 vaccine set ≥7 days earlier and deworming; avoid dog parks. Stop exposure if a puppy shows fear and seek veterinary guidance.                         | 7-8 wk, 7 days               | AVSAB 2008, AAHA 2015 (more permissive on timing; forced exposure sensitizes)                                                                                                               | High                                                               |
| R26       | Joint pain, brachycephalic, cardiac, post-surgery or cognitive decline: drop demanding behaviours, shorten sessions, health-clearance prompt.                                                                     | n/a                          | AAHA 2015 (senior monitoring) plus convention                                                                                                                                               | Med                                                                |
| R27       | No outdoor training on hot surfaces or in high heat.                                                                                                                                                              | n/a                          | convention (no source)                                                                                                                                                                      | Low                                                                |
| R28 (new) | A trainer-hiring or help-screening step flags any use of prong, shock, jerks, "dominance" explanations or throwing things.                                                                                        | n/a                          | AAHA 2015, AVSAB 2008/2021                                                                                                                                                                  | High                                                               |
| R29 (new) | Teach novice owners with food-only or a verbal marker; never present the clicker as required.                                                                                                                     | n/a                          | Feng 2018 (secondary), Chiandetti 2016, Feng 2017 (handlers find clickers cumbersome)                                                                                                       | Med                                                                |

Changes recommended to existing rules:

- R7: downgrade to Low.
- R10: change the pairing count to "5-20, until the dog orients to the marker".
- R12/R13: add AAHA 2015 as the source.
- R14: remove AAHA as source for the burst warning.
- R15/R16: re-tag "5-6 days/week" as convention.
- R18: remove "play".
- R17/R19: drop Chiandetti as a source.

---

## 4. Gaps and open questions

- No dog trials support the 80% criterion, the 3 Ds, session minutes, thinning ratios, lure-fade or cue transfer. They need TuringCare practice-log calibration.
- Demant 2011 and Meyer 2008 full text were not obtained; beagles in a lab doing simple tasks. Direction of the "three in a row" effect is unverified. Whether those results hold for pet dogs on varied tasks is unknown.
- Kis 2017 gains appeared after about a week, not after an hour. Whether the 1-hour rest rule matters in practice is unknown.
- Extinction burst size and duration in pet dogs: no data in this folder (Jakovcevic 2013 not read in full).
- Reinforcer preference stability over time is untested (Lazaro, Vicars use one-off assessments).
- Negative contrast (Bentosela 2009) is contested; it is unknown whether dogs sour on a downshift in tier.
- The harm evidence for "mixed" methods is stress behaviours only; cortisol and bias results were underpowered.
- CCPDT and IAABC allow documented aversives in safety cases. The engine's policy (R1) goes beyond them; a clinical advisor should confirm the wording.
- Full text could not be obtained for any of the 25 abstract-only rows (paywalled or blocked). Their numbers come from abstracts and secondary summaries and need a library copy before they are used as engine parameters.
- Unobtained (now abstract-only): Blackwell 2008, Masson 2018, Schilder 2004, Rooney 2011, Deldalle 2014, Arhant 2010, Casey 2014, Feuerbacher 2014/2015, Feng 2016, Fugazza 2015, Fukuzawa 2005, Dinwoodie 2019, Pryor 1969, and the AKC pages. Several are cited in NOTES only via secondary summaries.
- LINKS "Feng 2016" DOI came from a citation and is unverified.
