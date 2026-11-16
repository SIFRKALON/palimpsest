# Palimpsest — A Land Rewritten

An interactive historical atlas of the land called Canaan, Israel, Judah, Judaea, Palaestina, Filasṭīn, the Holy Land, and Eretz Yisrael, across about 5,000 years, from the Bronze Age to November 2026.

**Open it:** https://sifrkalon.github.io/palimpsest/

## What you can do

- **Press play.** The history runs as a film of about nineteen minutes: captions, a moving camera, and music generated in the scale of each age (Bronze Age lyre tunings, Greek modes, Byzantine chant, maqam, plainchant, and on to the present). Only the scales are historical; the melodies are improvised.
- **Pause and touch the map.** Tap a spot to see who rules it in that year; tap a town for its name then and now. Each answer is short, with a link to the full list.
- **Drag the coloured bar** to jump through time. **Read** opens the full chapter.
- Under **⋯**: short guided journeys, a lens that scrapes down to the layer beneath, and the map's layers. **⌕** searches places, older names, years and words.

## A note on fairness

This is a guide built to be fair to a contested history, not to settle it. Borders are washes of colour, not survey lines; flows show direction and rough scale, not exact figures; where one event carries two names (1948 above all), both are given. Colours are pigments, not flags. The last chapter reflects events as of **November 2026** and will need updating.

## How it is made

- `index.html`, `style.css`, `app.js`: the app (plain JavaScript; D3 is used for zooming).
- `data/content.js`: the chapter text, voices and glossary, carried over from the first edition.
- `data/atlas.js`: territories, towns, dated events, roads and journeys, all in real longitude and latitude.
- `data/geo.js`: coastline, lakes, rivers and modern boundaries from Natural Earth (public domain).
- `assets/relief.jpg`: the vellum relief sheet. It is drawn from the known landforms of the region as an illustration, not from surveyed elevation data. `tools/` holds the scripts that build it.
- `v1/`: the first edition (June 2026), kept as it was: https://sifrkalon.github.io/palimpsest/v1/

Historical outlines are approximate. Sources are listed in the app under **?**.

## License

Creative Commons **CC BY-SA 4.0**
