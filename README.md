# Sixty North 🍁

A Canadian focus timer for studying and working. Focus for 60 minutes, rest for 10, and take a 40-minute long break after four sessions. Every full hour of focus unlocks the next stop on a video tour of Canada. At hour 30 you unlock Chris Hadfield's talk on achieving your goals.

## What's inside

```
index.html                  the page
css/styles.css              all styles
js/app.js                   timer, tasks, trip, map, report, settings
js/data-provinces.js        province stories, facts, photo list, map shapes
assets/audio/anthem-instrumental.mp3        timer alarm
assets/img/provinces/<province>/            full-size photos (max 2400 px)
assets/img/provinces/<province>/thumbs/     small previews for fast loading
assets/img/provinces/<province>/flag.webp   provincial / territorial flag
.nojekyll                   tells GitHub Pages to serve files as they are
```

## Put it on GitHub Pages

1. Create a new repository on GitHub (for example `sixty-north`).
2. Upload **everything inside this folder**, keeping the folders exactly as they are. `index.html` must sit at the top level of the repository, not inside another folder.
   - Easiest: on the repo page choose **Add file → Upload files** and drag in the folder contents. The web uploader takes up to 100 files at a time, so upload `assets/img/provinces` in two batches if it complains.
   - Or with Git: `git add . && git commit -m "Sixty North" && git push`.
3. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, then **Save**.
4. After a minute or two the site is live at `https://<your-username>.github.io/<repo-name>/`.

File names are all lowercase with no spaces, because GitHub Pages is case-sensitive.

## Testing on your computer

Open a terminal in this folder and run `python3 -m http.server 8000`, then visit `http://localhost:8000`. Opening `index.html` by double-clicking also works, but a local server is closer to how GitHub Pages behaves.

## Notes

- Progress is saved in the browser's local storage on each device. Use **Report → Save backup file** to keep a copy.
- Videos are embedded from `youtube-nocookie.com` (YouTube's privacy-enhanced mode).
- Map shapes: created with mapchart.net, CC BY-SA 4.0.
