# Tool Health Factory Feedback Checklist

> **Version:** v2.2.0-tool-health
> **Use after:** 1-2 weeks of production deployment
> **Duration:** 5-10 minutes per operator

---

## Instructions

1. Interview CNC operators individually
2. Record answers without leading
3. Collect qualitative comments verbatim
4. Summarize findings for D6.1 decisions

---

## A. Visibility & Awareness

**Rating:** [ ] Not seen [ ] Seen but ignored [ ] Seen and used

| # | Question | Answer |
|---|----------|--------|
| 1 | Do you **see the Tool Health strip** in the CNC panel? | |
| 2 | Is the color status (green/yellow/red) **immediately clear**? | |
| 3 | Does the **wear %** feel useful? | |

> If Q1-3 = "Not seen / Not clear" → UI needs adjustment before logic changes

---

## B. Actual Behavior (Most Important)

**Rating:** [ ] Never [ ] 1-2 times [ ] Regular use

| # | Question | Answer |
|---|----------|--------|
| 4 | When you see **NEARING_LIMIT**, do you: | |
|   | [ ] Continue working | |
|   | [ ] Prepare new tool | |
|   | [ ] Change tool immediately | |
| 5 | When you see **OVER_LIMIT**, do you: | |
|   | [ ] Continue using | |
|   | [ ] Change tool | |
|   | [ ] Report to supervisor | |

> If OVER_LIMIT is ignored >50% of the time → threshold may be too conservative

---

## C. Accuracy (Trust)

**Rating:** [ ] Low [ ] Fair [ ] Very accurate

| # | Question | Answer |
|---|----------|--------|
| 6 | Does actual tool condition **match system status**? | |
| 7 | Any tools that "always show red but still work fine"? | |
| 8 | Any tools that "no warning but fail quickly"? | |

> This is the primary input for **D6.1 threshold tuning**

---

## D. Impact on Work

**Rating:** [ ] Worse [ ] No change [ ] Better

| # | Question | Answer |
|---|----------|--------|
| 9 | Tool Health makes my work: | |
|   | [ ] Slower | |
|   | [ ] No impact | |
|   | [ ] Reduced scrap / fewer hole defects | |
| 10 | I want this system to: | |
|   | [ ] Stay as-is | |
|   | [ ] Minor adjustments | |
|   | [ ] Be turned off | |

---

## E. Open-Ended Questions (Gold)

| # | Question | Response |
|---|----------|----------|
| 11 | "If you could change ONE thing, what would it be?" | |
| 12 | "Is there anything the system should NEVER do?" | |

---

## Summary (Interviewer fills)

**Date:** _______________
**Operator:** _______________
**Machine:** _______________

### Key Findings

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Recommended Actions

- [ ] Adjust threshold from 85% to ____%
- [ ] Add reset button (D6.1)
- [ ] Improve UI visibility
- [ ] No changes needed
- [ ] Other: _______________

---

## Aggregated Results Template

After collecting all feedback:

| Metric | Count | % |
|--------|-------|---|
| Total operators interviewed | | |
| See and use Tool Health | | |
| Trust the accuracy | | |
| Want to keep the feature | | |
| Request threshold adjustment | | |
| Request reset button | | |

### Decision Matrix

| Feedback Pattern | Action |
|------------------|--------|
| >70% don't see strip | Increase UI prominence |
| >50% ignore OVER_LIMIT | Raise threshold to 90-95% |
| >30% report inaccuracy | Calibrate material weights |
| >50% want reset button | Prioritize D6.1 |
| >30% want it removed | Investigate root cause |
