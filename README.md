# Oscar Gym

A minimal gym log for iPhone. Pick an exercise or machine, see your history, record what you lifted. A second tab tracks rowing times by distance.

Built as a web app (HTML/CSS/JS, no frameworks, no build step) so it runs anywhere, works offline, and can be added to the iPhone home screen like a real app.

## Using it

1. Open the app link on your iPhone in Safari.
2. Share → **Add to Home Screen**. It now opens full-screen with its own icon.
3. **Lifting** tab: tap an exercise → enter weight and reps → **Save set**. Last time's numbers are pre-filled.
4. **Rowing** tab: tap a distance → enter your time → **Save time**. Shows your /500m split.
5. Your best gets a **PB** badge. A rest timer starts counting after every save.
6. ⚙ Settings → **Export backup** now and then. Data lives on your phone only.

## Project files

| File | What it is |
|---|---|
| `index.html` | The screens (list, exercise, settings) |
| `style.css` | Looks. Colours are variables at the top |
| `app.js` | All the logic, commented top to bottom |
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
- [ ] v2 — progress charts, streak calendar
- [ ] v3 — exercise library (how to do each move)
- [ ] v4 — accounts, so friends get their own data
