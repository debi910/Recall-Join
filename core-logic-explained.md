# The differentiating 20%, explained

This is the code a judge will ask about. It all lives in `core/normalize.js` and `core/match.js`, about 150 lines with no AI and no randomness, and every decision can be traced.

## The problem in one line

We have two tables: the regulator's failed batches and the shop's stock. We want to join them, but **the join key (the batch number) is dirty and not unique.**

## Step 1: Clean the batch number (`normBatch`)

`" sp-240165/ "` → `SP240165`. Uppercase it, then drop everything that isn't a letter or a digit. Spaces, hyphens and slashes are formatting, not identity.

*Why not more?* Anything more aggressive, like turning O into 0, would change the identity of the batch. We never do that silently.

## Step 2: The look-alike key (`skelBatch`)

People and scanners confuse 0/O/Q/D, 1/I/L, 5/S, 8/B, 2/Z and 6/G. The **skeleton** maps each group to one symbol: `40324090O4` and `4032409004` both become `4032409004`.

The skeleton is stored as a column (`batch_skel`) with an index on it. **This is the join key.** Matching on it means we also find likely typos, not just exact matches.

*Trade-off:* the skeleton finds more candidates than are real. That's fine, because step 4 decides what each candidate means, and a skeleton-only match can never raise a FLAG.

## Step 3: Three independent checks on each candidate pair

| Check | How | Values |
|---|---|---|
| Maker (`mfrMatch`) | Take the distinctive words of each maker name and compare them. Legal words (Pvt, Ltd, M/s), address words and **industry words** (Pharma, Labs, Healthcare, Lifesciences…) are removed first. | match / differs / **unknown** |
| Expiry (`normMonth`) | Read "Jan-2027", "01/27", "2027-01" and "15/01/2027" as the same month | match / differs / unknown |
| Product (`productSimilarity`) | Shared meaningful words, ignoring dosage-form words like TAB and INJ, scored against the shorter name. Conflicting strengths halve the score. | 0–1 |

*Why remove industry words?* Before we did, "Daya **Formulations**" matched "Apple **Formulations** Pvt Ltd". A shared generic word proves nothing. A test now guards this.

*Why is "unknown" separate from "differs"?* Many billing exports have no maker column. Missing data must not count as evidence either way.

## Step 4: The four tiers (`classifyPair`)

```
batch exactly equal (after cleaning)?
├─ yes
│   ├─ maker matches AND (product similar OR expiry matches)  → FLAG
│   ├─ maker unknown AND (product similar OR expiry matches)  → FLAG
│   ├─ maker differs AND product different AND expiry differs → nothing (an unrelated product that shares a batch code)
│   └─ anything else                                          → REVIEW: "same batch code, check the strip"
└─ no, only the look-alike key matches
    ├─ product similar AND maker not known to differ          → REVIEW: "one character off"
    └─ otherwise                                              → nothing
No candidate at all, but the same maker + product is listed   → INFO: "brand flagged, not your batch"
```

**The rule to remember:** *a FLAG always needs the batch plus one more independent agreement.* That second agreement is what removes the false alarms that batch-only lookups raise.

*A bug the eval caught:* an early version flagged when the batch **and expiry** matched even though the maker differed. One eval case proved that wrong: a synthetic Pantoprazole stock row carrying the batch code of a listed Itraconazole batch from another maker, with the same expiry month by coincidence. Now a differing maker can never produce a FLAG; at most it goes to review.

## Step 5: Only humans escalate reviews

A REVIEW can become a quarantine only when the pharmacist taps "I checked the strip: it is the listed batch". The function enforces this server-side (`confirmedReview`), so the UI can't skip it.

## Step 6: Act atomically, then verify

Quarantine is **one TablesDB transaction**: mark the stock quarantined, close the matches, create one return note per supplier, and write the audit row. If any write fails, the function rolls back and nothing changes. After the commit, the function **reads the rows back**. Only if every stock row is quarantined and every note exists does it write a "✓ verified" audit entry.

## What it deliberately does not do

- It never calls a batch "safe". It only says "not on the lists imported".
- It uses no AI or embeddings for the decision. Similarity is shown for context only.
- It doesn't catch non-look-alike typos (for example swapped digits). That's a known limit. Catching them would need an edit-distance search, which would raise the number of reviews.

## Likely judge questions

1. **"Why not just exact-match?"** Real lists contain short codes like `0081` that other makers reuse, so exact matching raises false alarms. Formatting differences also make exact matching miss real hits. See the eval table.
2. **"Isn't 100% on your own eval suspicious?"** The cases are built to test known failure modes. We froze the rules on the March 2025 list, then ran them unchanged on the September 2026 list: 100% precision, against 60% for batch-only lookup. The honest limit: the stock rows are synthetic variants, not a real shop's data.
3. **"Why TablesDB rather than VectorsDB?"** The decision must be deterministic and explainable, because this is a safety call. A plain index join on a well-designed key does the job, and transactions plus row permissions do the rest.
4. **"What if CDSCO changes the PDF format?"** The parser maps columns by keyword, not position, and glues page-split rows back together. It was tested on a real 9-page list (70 of 70 rows).
