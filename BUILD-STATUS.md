# csv-reader-speed-01-run-20261121 — BUILD STATUS

## READY TO SUBMIT (coordinator: git + GitHub + bundle + submit)

Entry: faster drop-in for csv-reader 1.0.0. `solve.js` re-implements the
reference's exact broken-row policy with `indexOf` + `slice` field cutting
(no char-at-a-time loop); `main.ts` is the same driver shape as the house
baseline (reads `/input/cases.json`, answers each case alone with `run()`,
writes `/output/answers.json`).

## Correctness (Pass 1)

- Practice set: **6/6** via kit `grade-local --driver process`
  (`passed: 1`, L1 regrade reproduced byte for byte).
- 3 extra generated sets (different drand seeds, kit `draw.ts`): **6/6 each**.
- Differential vs reference `readCsv`: 89 hand-written edge cases
  (BOM, unterminated quotes, stray CRs, CRLF in quotes, quote junk,
  short/long rows, empty lines, header true/false) **89/89**;
  fuzz 20,000 random small inputs **20,000/20,000**;
  heavy fuzz 100,000 quote/CR-heavy inputs up to 200 chars **100,000/100,000**.

## Speed (Pass 2, fresh process, child CPU via RUSAGE_CHILDREN, 5 runs/set)

| set | mine median | baseline median | speedup | mine slower runs |
| --- | --- | --- | --- | --- |
| practice | 940 ms | 1,959 ms | 2.08x | 0/5 |
| gen1 | 963 ms | 1,838 ms | 1.91x | 0/5 |
| gen2 | 941 ms | 1,805 ms | 1.92x | 0/5 |
| gen3 | 825 ms | 1,776 ms | 2.15x | 0/5 |

Pure parse (`run()` only, warm process): mine ~290 ms vs reference ~1,342 ms
for the practice set (~4.6x on the parser; rest of the total is JSON.parse
~43 ms + JSON.stringify ~222 ms + node startup, which the baseline pays too).

Worst case: no case-set or single case is slower than the baseline on any
run; worst single-run mine time 1,174 ms vs baseline's best 1,487 ms on the
same set. Stress band: 0% of runs lose to the baseline.

## Top-10 bar

Unavailable: the dev leaderboard (`/leaderboard`, both views, and `/live`)
returns `total: 0, entries: []` — no dev scores published yet. Gate check
falls back to the baseline: ~2x faster on every set, 0% slower runs —
clears the submit gate (practice metric is not >15% worse than any bar;
no stress copy loses to the baseline).

## Repo requirements (coordinator note, done)

- `LICENSE` first line is `SPDX-License-Identifier: MIT`.
- `.makefun/owner.json` is exactly
  `{"wallet":"EjC4imuyvTvACPn5iYnzV8GGrzPmLdTMs1g8e46ffQuz"}`.
- Repo size ~15 KB (cap 1 MiB). No dependencies, no network, deterministic.
- GitHub repo About (homepage + `makefun` topic) to be set by the
  coordinator before submitting; repo `0xfats/csv-reader-speed-01-run-20261121`
  to be created by the coordinator (do not create/push from here).
- Transcripts: this competition runs NO transcript gate (RULES.txt:
  "This competition makes them optional"), but the builder session is
  recorded — coordinator pulls usage rows via `muse.db` after this run,
  re-bundles `--no-discover --no-family`, re-checks, then submits.

## Deadlines

Entries close 2026-11-23T02:42:00Z (09:42 WIB 23 Nov). Result due
2026-12-08T02:42:00Z. Prizes: 1st–10th $10 each; a reward needs beating
the house baseline at 95% confidence in the final heat.
