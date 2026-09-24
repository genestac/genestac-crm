# Genestac Health OS — Precise 40-Point Gap Map
### Vision vs Reality · Based on actual source code · September 2026

**Current Tab Navigation:** Home | Log | Diet | Exercise | Steps | Refer | Profile
**Vision Tab Navigation:** Home | My Health | Care | AI Coach | Doctors | Records

---

## Legend
- ✅ **Built** — exists and works
- 🟡 **Partial** — some components exist, core missing
- 🔴 **Not Built** — zero code for this

---

## 1. MAIN PATIENT DASHBOARD
**Status: 🟡 Partial — weight-loss dashboard exists, Health OS dashboard does not**

| Element | Status |
|---|---|
| Weight + change, BMI | ✅ `CurrentStatsCards`, `WeightLossChart` |
| Water, sleep, steps widgets | ✅ In dashboard |
| Habits checklist | ✅ `HabitsChecklistWidget` |
| Good morning + name | ✅ `TopNavbar` |
| Health Score (0–100) | 🔴 Not built |
| Blood pressure, glucose | 🔴 No field in data model |
| Pain score | 🔴 Not built |
| Medication adherence % | 🔴 No medication tracking |
| Next injection / blood test / doctor review | 🔴 Not built |
| Biological Age | 🔴 Not built |
| "3 things need attention" | 🔴 Not built |
| Daily Genestac Health Brief (AI narrative) | 🔴 Not built |

---

## 2. MY HEALTH — DIGITAL BODY PROFILE
**Status: 🟡 Partial — basic intake exists, clinical depth missing**

`HealthProfile` type has: age, gender, height, weight, targetWeight, goal, activityLevel, dietaryPreference, medicalConditions, allergies.

| Field | Status |
|---|---|
| Age, gender, height, weight, goal, activity, diet, allergies | ✅ `HealthProfile` type |
| Medications (text) | 🟡 Collected in `ai-doctor.tsx` intake only — not stored persistently |
| Waist / arms / chest / hips | 🟡 `BodyMeasurementsWidget` (logged) but not in core profile |
| Body fat %, muscle mass, visceral fat | 🔴 Not built |
| Blood pressure, resting HR, SpO2 | 🔴 No field anywhere |
| Surgical history, family history | 🔴 AI doctor intake only — not persisted |
| Smoking / alcohol | 🔴 AI doctor intake only — not persisted |
| Menstrual / reproductive history | 🔴 Not built |
| Supplements | 🔴 Not built |
| Stress, occupation | 🔴 Not built |
| **Unified cross-department profile** | 🔴 **Weight app, AI doctor, and CRM use separate records** |

---

## 3. DIGITAL HEALTH TIMELINE
**Status: 🔴 Not Built**

`HistoryModal` exists for per-metric history only (e.g. all water logs). There is no:
- Cross-type chronological timeline (labs + weight + medication + procedure + consultation mixed)
- Date-anchor scrolling
- Filter tabs (Labs / Imaging / Medication / Procedures / Consultations)
- ABDM integration

**Everything needed is missing.**

---

## 4. GENESTAC AI HEALTH COPILOT
**Status: 🟡 Partial — AI interface built, patient data awareness missing**

| Element | Status |
|---|---|
| `ai-doctor-chat.tsx` voice + text chat UI | ✅ Built (1,021 lines) |
| Sarvam voice integration (`lib/sarvamVoice.ts`) | ✅ Built |
| 7-step clinical intake (`ai-doctor.tsx`) | ✅ Built (profile → lifestyle → medical → complaint → interview → timeline → review) |
| AI knows patient's weight / sleep / meal / step history | 🔴 Not built |
| AI knows previous blood test requests | 🔴 Not built |
| AI knows medications or treatment protocol | 🔴 Not built |
| AI can answer "Has my HbA1c improved?" | 🔴 No RAG over patient data |
| 3-tier safety (Routine / Doctor review / Urgent) | 🔴 Not built |
| Clinical guardrails (never modifies prescriptions) | 🔴 No guardrail layer |

> Note: `ai-doctor-chat.tsx` line 32 has a comment *"The backend injects the user's health profile, daily logs and plans automatically"* — this is **commented intent, not implemented**.

---

## 5. AI LAB REPORT INTERPRETER
**Status: 🔴 Not Built (request-only flow exists)**

| Element | Status |
|---|---|
| Patient requests a blood test | ✅ `BloodTestWidget` |
| Doctor suggests test types | ✅ `BloodTestRequest.suggested_tests` |
| Upload PDF / photo of actual lab result | 🔴 Not built |
| AI extraction of CBC, HbA1c, glucose, lipids, vitamins, hormones | 🔴 Not built |
| Value + previous + reference range per analyte | 🔴 Not built |
| Trend charts (Vitamin D: 19→23→31→42) | 🔴 Not built |
| "What it means / What your doctor may consider" | 🔴 Not built |
| Abnormal flag → doctor escalation | 🔴 Not built |

---

## 6. IMAGING VAULT
**Status: 🔴 Not Built**

No screen, no data type, no storage for MRI / CT / X-ray / DEXA / ECG / pathology reports.
Cloudinary upload exists for transformation photos — same infrastructure could be reused.

---

## 7. PAIN & REGENERATION MODULE
**Status: 🔴 Not Built**

Pain patients have **zero mobile experience**. No code anywhere for:
- Interactive 3D body pain map
- Pain intensity / type (burning/stabbing/aching) / radiation / duration logging
- Outcome tracking (pre-procedure vs post-procedure: pain 8→3, walking 400m→2.1km, knee flexion 95°→120°)
- Pain trend chart

---

## 8. REHABILITATION MODULE
**Status: 🟡 Partial — general exercise exists, physio rehab missing**

| Element | Status |
|---|---|
| 7-day AI exercise plan with YouTube videos | ✅ `exercise.tsx` |
| Doctor approval before patient sees plan | ✅ `UnderDoctorReviewCard` |
| Physio-prescribed specific rehab exercises | 🔴 Not built |
| Set / rep / duration completion logging | 🔴 Not built |
| Compliance report visible to physio / doctor | 🔴 Not built |
| Camera-based form recognition | 🔴 Not built |

---

## 9. WEIGHT LOSS MODULE — EXPAND
**Status: 🟡 Strong base, GLP-1 critical features missing**

| Element | Status |
|---|---|
| Weight logging + chart (7D/30D/90D/All) | ✅ `WeightLossChart` |
| Transformation photos (Cloudinary) | ✅ `TransformationGallery` |
| Water, sleep, body measurements tracking | ✅ Dedicated widgets |
| Meal logging + AI calorie feedback | ✅ `analyzeMeal()` via NVIDIA Llama |
| 16:8 fasting timer | ✅ `fasting.tsx` |
| Habits checklist | ✅ `HabitsChecklistWidget` |
| Calorie / protein / fibre / carb breakdown | 🔴 Only total calories estimated |
| GLP-1 dashboard (dose, week X of 24, starting vs current weight) | 🔴 Not built |
| Injection date tracker + reminder | 🔴 Not built |
| Injection site rotation | 🔴 Not built |
| Side effect log per dose (nausea, constipation, appetite) | 🔴 Not built |
| Medication inventory (pens remaining) | 🔴 Not built |
| Physician-directed titration workflow | 🔴 Not built |

---

## 10. FOOD AI
**Status: 🟡 Partial — text description works, photo missing**

| Element | Status |
|---|---|
| Text description → calories + feedback (NVIDIA Llama) | ✅ `analyzeMeal()` |
| AI recipe recommendations | ✅ `HealthyRecipesWidget` |
| Camera photo → AI food recognition | 🔴 Not built |
| Indian food recognition (dal, paneer, dosa, roti, biryani etc.) | 🔴 Not explicitly supported |
| Full macros: protein, carbs, fat, fibre | 🔴 Only calories returned |
| "Does this fit MY program today?" contextual response | 🔴 No daily macro tracking to compare against |

---

## 11. LONGEVITY MODULE
**Status: 🔴 Not Built**

No Longevity Score, no sub-components (Metabolic / Cardiovascular / Inflammatory / Hormonal / Body Composition / Sleep / Cognitive / Nutrition / Lifestyle), no intervention-to-score mapping.

---

## 12. BIOLOGICAL AGE
**Status: 🔴 Not Built**

No Metabolic age / Cardiovascular age / Functional age / Body Composition age tracking. No chronological vs health age comparison or 12-month target.

---

## 13. HEALTH TEST MARKETPLACE
**Status: 🟡 Partial — basic request exists, marketplace missing**

| Element | Status |
|---|---|
| Patient requests a blood test | ✅ `BloodTestWidget` |
| Doctor reviews and suggests test types | ✅ `BloodTestRequest.suggested_tests` |
| Curated panels (Longevity, Men's Health, Hair Loss, Cardiac Risk etc.) | 🔴 Not built |
| Home blood collection booking | 🔴 Not built |
| Results automatically appear in app | 🔴 Not built |
| AI explanation after results | 🔴 Not built |

---

## 14. CARDIOMETABOLIC / HEART & DIABETES
**Status: 🔴 Not Built**

No tracking for BP, fasting glucose, HbA1c, fasting insulin, HOMA-IR, triglycerides, LDL/ApoB, HDL, Lp(a), resting HR, HRV. No risk trend visualization.

---

## 15. CGM INTEGRATION
**Status: 🔴 Not Built**

No Libre / Dexcom integration. No glucose time-in-range, variability, post-meal spikes, night glucose.

---

## 16. WEARABLE INTEGRATION
**Status: 🟡 Partial — steps only**

| Element | Status |
|---|---|
| Step counting via `expo-sensors` Pedometer | ✅ `steps.tsx` |
| Apple HealthKit (HR, HRV, sleep, calories, SpO2) | 🔴 Not built |
| Android Health Connect | 🔴 Not built |
| Garmin / Oura / Fitbit / Whoop | 🔴 Not built |
| Smart scales (body fat, muscle mass) | 🔴 Not built |
| AI transforms wearable data into clinical action | 🔴 Not built |

---

## 17. HAIR HEALTH MODULE
**Status: 🔴 Not Built**

Hair patients have **zero mobile experience**. No hair density / shedding / scalp scoring, no monthly photo comparison, no PRP schedule, no medication reminders.

---

## 18. SKIN & AESTHETICS
**Status: 🔴 Not Built**

No AI Skin Diary, no standardized face photo tracking, no treatment progression visualization (laser, PRP, microneedling, peels).

---

## 19. MEN'S HEALTH
**Status: 🔴 Not Built**

No testosterone / energy / body composition / hormone lab tracking. No prostate screening guidance or fertility referral.

---

## 20. WOMEN'S HEALTH
**Status: 🔴 Not Built**

No menstrual cycle, PCOS, menopause, thyroid, bone health, or fertility referral module.

---

## 21. PERFORMANCE / BIOHACKING
**Status: 🔴 Not Built**

No VO2 max / HRV / recovery score / lean body mass / grip strength. No goal-based performance plan (Fat Loss / Muscle Gain / Athletic Performance / Healthy Aging / Energy).

---

## 22. MEDICATION CENTER
**Status: 🔴 Not Built**

Medications captured as free-text in `ai-doctor.tsx` intake — not stored persistently, not acted upon.

Missing:
- Morning / afternoon / evening / weekly schedule
- Prescription + dosage + start/end dates
- Missed dose tracking + inventory
- Refill reminders
- Injection site rotation assistant
- Side effect tracking per medication

---

## 23. SUPPLEMENT CENTER
**Status: 🔴 Not Built**

No doctor-prescribed vs patient-added supplement tracking, no dosage/timing, no interaction warnings.

---

## 24. SIDE-EFFECT MONITORING
**Status: 🔴 Not Built**

No symptom check system for any treatment pathway. No escalation algorithm.

GLP-1 symptoms not tracked: nausea / vomiting / diarrhea / constipation / abdominal pain / appetite / hydration.
Pain procedure symptoms not tracked: swelling / temperature / redness / weakness / numbness.

---

## 25. DOCTOR CONSULTATIONS
**Status: 🔴 Not Built in mobile app**

CRM has full appointment booking + Jitsi video. Mobile app has **zero** appointment functionality.

Missing from mobile:
- Booking with date picker, specialist selection, in-person vs video vs chat
- Upcoming appointment list + Jitsi "Join Meeting" button
- Past appointment history
- Pre-consult AI summary generated and sent to doctor
- Specialist directory

---

## 26. SECURE DOCTOR MESSAGING
**Status: 🔴 Not Built**

Everything uses WhatsApp externally. No in-app messaging with doctor, nutritionist, physio, or care coordinator. No attachment support, no read receipts.

---

## 27. CARE TEAM
**Status: 🔴 Not Built**

Patients have no visibility into who is monitoring them. No named care team, no specialty listing, no contact method.

---

## 28. MY CARE PLAN
**Status: 🟡 Partial — diet/exercise plan exists, clinical goals missing**

| Element | Status |
|---|---|
| 7-day diet plan (AI-generated, doctor-approved) | ✅ `diet.tsx` |
| 7-day exercise plan (AI-generated, doctor-approved) | ✅ `exercise.tsx` |
| Doctor approval gate (`UnderDoctorReviewCard`) | ✅ |
| Clinical goals: Lose 8 kg / HbA1c <5.7% / Pain <3/10 | 🔴 Not built |
| Baseline → Target → Current progress per goal | 🔴 Not built |
| 90-day unified plan across departments | 🔴 Not built |

---

## 29. MEDICAL RECORDS VAULT
**Status: 🔴 Not Built**

No document categories (lab reports / prescriptions / imaging / procedures / discharge summaries / doctor notes / invoices / vaccinations). No search, no download, no ABDM integration.

---

## 30. FAMILY HEALTH
**Status: 🔴 Not Built**

App is single-user only. No multi-profile support for parents, spouse, or children.

---

## 31. EMERGENCY HEALTH CARD
**Status: 🔴 Not Built**

No QR-accessible emergency profile (blood group, allergies, diseases, medications, emergency contacts).

---

## 32. HOME HEALTH SERVICES
**Status: 🔴 Not Built**

No booking or status tracking for home blood collection, nurse visits, IV therapy, home physiotherapy, or medication delivery.

---

## 33. PHARMACY / TREATMENT DELIVERY
**Status: 🔴 Not Built in mobile app**

CRM has inventory + proforma invoices. Mobile has Razorpay + subscription purchase. Missing:
- Post-purchase delivery status (Pharmacy processing → Cold-chain → In transit → Delivered)
- Cold-chain compliance tracking for GLP-1 medications
- Physician authorization gate before payment

---

## 34. OUTCOMES DATABASE
**Status: 🔴 Not Built**

No anonymized longitudinal outcomes collection (PRP knee results, GLP-1 weight reduction averages, dropout rates). No research consent layer.

---

## 35. AI OUTCOME PREDICTION
**Status: 🔴 Not Built**

*(Correctly a later-phase feature — needs outcome data first.)*

---

## 36. PATIENT-REPORTED OUTCOME MEASURES (PROMs)
**Status: 🔴 Not Built**

No validated tools: VAS / KOOS / WOMAC for pain, ISI / PSQI for sleep, EQ-5D for quality of life, PROMIS instruments.

---

## 37. GENESTAC HEALTH SCORE
**Status: 🔴 Not Built**

`badgeEvaluator.ts` tracks achievement milestones but not a composite health score. No sub-scores (Metabolic / Cardiac / Inflammation / Fitness / Sleep / Nutrition / Body Composition).

---

## 38. "WHAT SHOULD I DO TODAY?"
**Status: 🟡 Partial — habits exist, cross-module daily aggregation missing**

| Element | Status |
|---|---|
| `HabitsChecklistWidget` — custom daily habits | ✅ |
| Medication reminders in daily list | 🔴 No medication tracking |
| Injection reminder in daily list | 🔴 Not built |
| Appointment reminder in daily list | 🔴 No appointment in mobile |
| Lab test due today | 🔴 Not built |
| Exercise completion from exercise plan | 🔴 Not connected to daily list |
| Cross-module aggregated daily task list | 🔴 Not built |

---

## 39. ACHIEVEMENTS / BADGES
**Status: ✅ Built — well implemented**

- ✅ `badges.tsx` (1,746 lines) — 7 categories: weight / streaks / hydration / nutrition / steps / mindfulness
- ✅ `badgeEvaluator.ts` (16KB) — full evaluation engine
- ✅ Victory Share card (capture + share as image via `expo-sharing`)
- ✅ Month 1 / 2 / 3 milestone tabs
- ✅ Locked vs unlocked states with "closest locked badge" motivation

---

## 40. CONTENT / LEARNING CENTER
**Status: 🔴 Not Built in mobile app**

CRM has a blog admin module. Mobile has `HealthyRecipesWidget` (AI-generated, not editorial). Missing:
- Personalized content feed per treatment pathway
- GLP-1 patient sees: managing nausea, protein requirements, constipation
- Pain patient sees: MRI explained, PRP recovery, RFA
- Hair patient sees hair content
- Video education library

---

## MASTER SUMMARY

| Score | Count |
|---|---|
| ✅ Fully Built | 2 of 40 (#39 Badges, base of #9 Weight Loss) |
| 🟡 Partially Built | 8 of 40 (#1, 2, 4, 8, 9, 10, 13, 16, 28, 38) |
| 🔴 Not Built | 30 of 40 |

---

## 90-Day Build Order

### Month 1 — Connect CRM to Mobile (low-hanging fruit)
1. **Appointment booking + Jitsi join** — CRM has it all, just needs mobile UI
2. **GLP-1 medication dashboard** — injection date, dose, week X of 24, site rotation, side-effect log
3. **Side-effect monitoring** — per-pathway symptom checklist with doctor escalation
4. **Daily task aggregator** — cross-module "What do I do today?"

### Month 2 — Clinical Intelligence
5. **Lab report upload + AI interpretation** — PDF/photo → extract → trend charts
6. **Health Score** — composite formula from already-tracked data
7. **AI Copilot data access** — RAG over patient's weight/sleep/meal/measurement history
8. **Pain & Mobility module** — body map + outcome tracking (unlocks pain patients)

### Month 3 — New Verticals
9. **Hair Health module** — standardized photo comparison + PRP schedule
10. **Medical Records Vault** — prescriptions, reports, imaging
11. **Secure doctor messaging** — move clinical comms off WhatsApp
12. **Care Plan with clinical goals** — doctor sets targets, patient tracks progress
