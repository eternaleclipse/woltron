# Credits

Woltron's visuals are built from the following third-party assets. Everything is
generated reproducibly by `assets/scripts/build_assets.py` from the originals in
`assets/source/` (`pip install cairosvg pillow fonttools`, then run the script from the repo root).

## Fluent Emoji (Microsoft) — MIT License

- Source: https://github.com/microsoft/fluentui-emoji
- Author: Microsoft Corporation
- License: MIT — full text in `assets/source/fluent-emoji/LICENSE`

| Used for | Fluent Emoji asset (Color SVG) |
|---|---|
| **Woltie the mascot** (all states), app icons, favicon, tray icons, logo, banner | Dog face (`dog_face_color.svg`), split into layers and re-composed with new hand-drawn expressions (happy/closed/puppy eyes, brows, frown, sniff lines, blush) |
| Mascot props | Magnifying glass tilted left (sniffing), Zzz (sleeping), Bone (eating), Droplet (sad), Sparkles & Red heart (happy/eating) |
| Brand stickers (`assets/brand/stickers/`) and banner doodles | Bone, Bowl with spoon, Steaming bowl, Pizza, Sushi, Hamburger, Taco, Dumpling, Takeout box, Paw prints |

The mascot artwork in `apps/web/public/mascot/` and the icons are derivative works of
the above and are distributed under the same MIT terms (Copyright (c) Microsoft Corporation).

## Fredoka (font) — SIL Open Font License 1.1

- Source: https://github.com/google/fonts/tree/main/ofl/fredoka (Google Fonts)
- Author: The Fredoka Project Authors (Milena Brandão, Hafontia)
- License: OFL-1.1 — full text in `assets/source/fonts/OFL.txt`
- Used for: the "Woltron" wordmark and banner tagline (converted to outlines in `assets/brand/*.svg`).
