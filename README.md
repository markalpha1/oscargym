# Oscar Gym

A minimal gym log for iPhone. Pick an exercise or machine, see your history, record what you lifted. A second tab tracks rowing times by distance.

Built as a web app (HTML/CSS/JS, no frameworks, no build step) so it runs anywhere, works offline, and can be added to the iPhone home screen like a real app.

## Using it

1. Open the app link on your iPhone in Safari.
2. Share → **Add to Home Screen**. It now opens full-screen with its own icon.
3. **Lifting** tab: tap an exercise → enter weight and reps → **Save set**. Last time's numbers are pre-filled.
4. **Rowing** tab: tap a distance → enter your time → **Save time**. Shows your /500m split.
5. Your best gets a **PB** badge. A rest timer starts counting after every save.
6. Tap ☆ on an exercise to **favourite** it: it moves to the top of the list with a mini progress graph. The exercise page shows the full graph (your best each session). Tap a point to see the number. Swipe left/right to flip between Lifting and Rowing.
7. ⚙ Settings → **Sign in** (email + password) and every set is saved to the cloud too. Works offline; catches up when you have signal. Same account on a new phone = all your history back.
8. **Export backup** is still there as a belt-and-braces file copy.

## Project files

| File | What it is |
|---|---|
| `index.html` | The screens (list, exercise, settings) |
| `style.css` | Looks. Colours are variables at the top |
| `app.js` | All the logic, commented top to bottom |
| `sync.js` | Cloud sync + sign-in (Firebase). The app works without it |
| `firestore.rules` | Who can read/write what in the cloud — paste into the Firebase console |
| `sw.js` | Offline support (service worker). **Bump `CACHE` when you change files** |
| `manifest.webmanifest` | Home-screen app name and icon |
| `icons/` | App icon |

## Running it locally

Any static file server works. For example, in this folder:

```
python -m http.server 8000
```

then open http://localhost:8000. (Service workers need `localhost` or `https`, not `file://`.)

## Roadmap

- [x] v1 — exercise list, history, log sets; rowing tab with times
- [x] v1.5 — cloud sync + accounts (Firebase), so nothing is lost and friends get their own data
- [x] v2 — favourites, progress graphs, black & white glass look, page animations
- [ ] v2.5 — streak calendar
- [ ] v3 — exercise library (how to do each move)

Live at https://markalpha1.github.io/oscargym/ (GitHub Pages, from `main`).
