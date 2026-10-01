# Oscar Gym — notes for Claude

This is **Oscar's first app**. Oscar is a beginner using his dad Mark's Claude account; Mark
(mark@crucial.studio) owns the GitHub account `markalpha1`. Be warm, explain things in plain
English, keep momentum, and make it fun. Commit as `Oscar <oscar@users.noreply.github.com>`.

## What it is

A minimal, dark, iPhone-first web app (PWA). Two tabs at the top:
- **Lifting** — list of exercises/machines grouped by body part → tap → history + log weight × reps.
- **Rowing** — list of distances → tap → history + log a time (shows /500 m split).
PB badge, rest timer, backup export/import. Data in `localStorage` on the phone only (v1).

## Rules

- **Plain HTML/CSS/JS, no frameworks, no build step, no npm.** Every file must stay readable
  by a beginner. Comment generously.
- **Never lose Oscar's data.** Any change to the stored shape must be upgraded in `load()`
  (see the `kind` upgrade for an example), never by wiping. Backup/restore must keep working.
- **Bump `CACHE` in `sw.js` on every deploy**, or phones keep serving the old version.
- Keep tap targets ≥ 44 px, respect safe-area insets, test at iPhone width (375 px).
- Small steps: one feature → test → commit → push. Show Oscar the result in the browser pane
  and/or on his phone before moving on.

## Workflow

```
git add -A ; git commit -m "..." ; git push
```
Remote: https://github.com/markalpha1/oscargym (private). Hosting decision pending — see
README roadmap. Local preview: any static server at the project root (service worker needs
localhost or https).

## Roadmap (agreed with Oscar, 2026-10-01)

v1 list+log+rowing (done) → v2 charts & streaks → v3 exercise library → v4 accounts for mates
(needs a backend; design storage so it can be swapped — all persistence goes through
`load()`/`save()` in `app.js`).
