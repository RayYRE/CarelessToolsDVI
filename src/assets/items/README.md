# Game icons

Extract the game's SVG zip straight into this folder (subfolders are fine):

```
src/assets/icons/
  bronze_bar.svg
  steel_bar.svg
  ...
```

`src/game/icons.js` picks up every `.svg` here at build time and matches files to item names
ignoring case, spaces, and punctuation, so `Steel bar`, `steel_bar.svg`, `Steel-Bar.svg` and
`steelbar.svg` all match. Items with no matching file just show no icon.
