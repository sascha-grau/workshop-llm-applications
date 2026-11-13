# Conventions for code comments and documentation

*Deutsche Fassung: [conventions.de.md](conventions.de.md)*

These rules apply to all lessons. They prevent the same information from living in several places and drifting apart. Lessons 04 and 08 are the pilot; the other lessons follow.

## Where information lives

Every piece of information has exactly one home. Other places link to it.

| Information | Home |
|---|---|
| What the file does, how to start it, tasks including resets | Header of the lesson file |
| Why a line of code looks the way it does (only if not obvious) | Comment at that line |
| Idea, steps, expected output, pitfalls, terms | `lessons/NN/GUIDE.md` and `GUIDE.de.md` |
| Overview of the parts, order, dependencies | `lessons/NN/README.md` and `README.de.md` |
| Data flow between lessons, artefacts, contracts | [`docs/architecture.md`](architecture.md) |
| Reasoned decisions | [`docs/decisions.md`](decisions.md) |
| Workshop simplifications versus production, further reading | [`docs/production.md`](production.md) |
| Schedule, timings, preparation, solutions and expected results of the tasks, talking points | [`docs/trainer.md`](trainer.md) |
| Default values of the switches (reset table) | Code (`// Standard:`) and the reset table in [`docs/trainer.md`](trainer.md) |
| Which lesson reads which index | [`docs/architecture.md`](architecture.md); file headers only briefly under "Schreibt:" |
| A measurement run (numbers, duration) | Exactly one place, with model and date; everything else links there |
| Error messages and their fixes | "Troubleshooting" section of the root README |

## Language

- Code comments: German. Error messages and console output: English.
- Guides and documents under `docs/`: German (`*.de.md`) and English (`*.md`), same content.

## Header of a lesson file

20 lines at most, about 15 as the target. Template (the comments themselves are German):

```ts
// Lektion NN – Thema, Teil N: Titel
//
// Lernziel: ein Satz.
// Braucht:  what must have run before (e.g. `npm run l04:0`, LM Studio with E5; `SHOW_THINKING` empty if the part reads JSON).
// Schreibt: what is produced and who reads it (only if something is produced).
// Start:    npm run lNN:N   (oder F5)
// Erklärt:  lessons/NN-…/GUIDE.de.md → „Teil N“
//
// Aufgabe:
//   1. …
//   2. …
//   ↺ Danach zurücksetzen: `CONSTANT` auf `value` (sonst …).
//
// Lesen: die Zeilen `// KERN 1–n`. Der Rest ist Handwerk.
```

- At most three tasks. Every task that changes something ends with a ↺ reset line.
- A task takes about five minutes at most on reference hardware. Otherwise it is marked "(Demo)" and the trainer notes say how to demonstrate it.
- Tasks never destroy anything that is slow to restore: rename instead of delete.
- Tasks live only here. README and guide link to them and do not repeat them.
- No repeated setup (Burp, `.env`, Docker): that is in the root README.

## Comments in code

| Rule | Content |
|---|---|
| Content | Only what the code does not say itself: why, invariant, security reason, workaround with its trigger. Do not narrate the call. |
| Length | At most three lines per block. Anything longer becomes a guide section with a link. |
| No lists of users | Not "used by Lessons 05, 07, 08". The editor's search finds that. |
| No measured values | No measured numbers (durations, hits, tokens). Each measurement run lives in exactly one place (guide or trainer notes), with model and date. |
| Values in prose | Prose names settings (`timeout` in the judge block, `MAX_ADDED_SUBSECTIONS`), not their values. Where a number is needed, `docs:check` compares it with the code. |
| Constants | A tunable constant gets its default and direction: `// Standard: 95. Kleiner = mehr Schnitte.` |
| Links | Repo-relative with a section: `// Siehe docs/decisions.de.md#judge-huelle`. |

Markers, at most one per block:

| Marker | Meaning |
|---|---|
| `KERN n:` | The lines that carry the learning goal, numbered. The guide explains the same numbers. |
| `NEU:` | First appearance compared with the previous part. |
| `VEREINFACHT:` | Workshop shortcut; details in `docs/production.md`. |
| `LEHRKOPIE (→ file#symbol):` | Deliberate copy for reading; the original lives there. |
| `SYNC (→ file#key):` | Copy that must stay identical (e.g. the judge block in Parts 5 and 6); `docs:check` compares both. |
| `UMGEHUNG (package version):` | Workaround for a library behaviour; goes away when the package changes. |

## Lesson guide (`GUIDE.md`)

```markdown
# Lesson NN – Title: Guide
## What is this about?      (three sentences, an everyday comparison)
## Where are we?            (pipeline as a text picture, current step marked)
## New terms                (table: term | in one sentence | example; about five at most)
## Check first              (checklist)
## Part N – Title
**In one sentence:** …
**Steps** (same numbers as `KERN 1–n` in the code)
**What you see** (shortened real output; model and date of the measurement)
**What does it mean?** (three to five points about the output; no task solutions)
**Pitfalls** (what is right although it looks wrong)
**If it fails** (message → fix)
> **Deep dive:** … (for advanced readers, linking to decisions/production)
## Takeaways                 (three key sentences)
## What comes next           (who uses the result?)
```

- Tone: direct "you", one idea per sentence.
- Tasks are not in the guide. "Try it" points to the file header and only says what to look for.
- Expected task results live only in the trainer notes.
- A new term is explained before it is used ("New terms" table or a half-sentence in the text).

## Lesson README

About 60 lines at most: learning goal, table of parts (file, start command, what it shows), order and dependencies, links to the guide and other documents. No tasks, no long explanations, no default values, no links to solutions (trainer notes only marked "for trainers").

## Check

`npm run check` runs the type check, `npm run docs:check` and the tests of the teaching copies (they compare every `LEHRKOPIE` with its original). `docs:check` verifies scripts, files, links and anchors (also from code comments), names of constants and functions, numbers next to constants (mark examples with "(example)" or `<!-- docs:check-ignore -->`), pinned versions against `package.json`, `SYNC` copies and that the German and English versions match. If it fails, something is out of date. There is no git hook: run `npm run check` yourself before every commit.
