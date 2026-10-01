# Oscar Gym — notes for Claude

This is **Oscar's first app**. Oscar is a beginner using his dad Mark's Claude account; Mark
(mark@crucial.studio) owns the GitHub account `markalpha1` and the Firebase project. Be warm,
explain things in plain English, keep momentum, and make it fun. Commit as
`Oscar <oscar@users.noreply.github.com>` (set in this repo's git config).

## What it is

A minimal, dark, iPhone-first web app (PWA). Two tabs at the top:
- **Lifting** — exercises/machines grouped by body part → tap → history + log weight × reps.
- **Rowing** — distances → tap → history + log a time (shows /500 m split).
PB badge, rest timer, sanity check on wild numbers, slide-up panel (`openSheet`) instead of
browser dialogs, backup export/import, **cloud sync + accounts via Firebase** (`sync.js`).

## Rules

- **Plain HTML/CSS/JS, no frameworks, no build step, no npm.** Every file must stay readable
  by a beginner. Comment generously. Firebase is loaded as ES modules from gstatic.
- **Never lose Oscar's data.** `localStorage` is the source of truth for the screen; the
  cloud is a mirror. Any change to the stored shape is upgraded in `load()` (see the fixed-id
  and `updatedAt` upgrades), never by wiping. Backup/restore must keep working.
- **Sync model:** every record carries `updatedAt`; newer wins on merge; deletes are
  tombstones `{ id, deleted: true, updatedAt }` (kept locally in `db.tombstones` so offline
  deletes stick). All writes go through `cloudUpsert`/`cloudDelete` in app.js — add those
  calls to any new mutation. Starter exercises have fixed ids (`lift-bench-press`, `row-2000`)
  so phones agree.
- **Never use `confirm()`/`prompt()`/`alert()`** — the desktop preview pane blocks them and
  they look poor on iPhone. Use `openSheet` / `toast`.
- **Bump `CACHE` in `sw.js` on every deploy**, or phones keep serving the old version.
- Keep tap targets ≥ 44 px, respect safe-area insets, test at iPhone width (375 px).
- Small steps: one feature → test → commit → push. Show Oscar the result before moving on.
- Hosting must stay free, must not pause on inactivity, must not need a card (why Supabase
  was rejected in favour of Firebase).

## Firebase (project `oscargym-3249c`, Mark's Google account)

- Config is in `sync.js` (public by design). Rules in `firestore.rules` — Mark pastes them
  into Console → Firestore → Rules. Data layout: `users/{uid}/exercises/{id}`,
  `users/{uid}/sets/{id}`.
- Auth: email + password (magic links break in iOS home-screen apps). The live domain
  `markalpha1.github.io` must be in Console → Authentication → Settings → Authorized domains.
- Never commit anything but the public web config. No service-account keys, ever.

## Workflow

```
git add -A ; git commit -F msg.txt ; git push
```
Remote: https://github.com/markalpha1/oscargym — public, GitHub Pages from `main` root →
https://markalpha1.github.io/oscargym/. Local preview: `powershell -File serve.ps1` → 
http://localhost:8787 (`.claude/launch.json` has it). The preview pane cannot register
service workers — that error is expected there. Testing is done by driving the page with
JavaScript (set input values, click buttons, read `localStorage`).

## Roadmap (agreed with Oscar, 2026-10-01)

v1 list+log+rowing ✓ → v1.5 cloud sync/accounts ✓ → v2 charts & streaks → v3 exercise
library. Oscar's own asks so far: minimal dark look, rowing tab with times by distance.
