---
name: Stories
description: Hearth, a calm dark storybook app for reading and listening at any time of day, with green-tinted surfaces and glowing line-icon covers.
colors:
  hearth-night: "#101411"
  hearth-surface: "#1a211c"
  hearth-raised: "#232b25"
  hearth-panel-deep: "#20291f"
  lantern-text: "#f1f2e9"
  story-text: "#e6e7dd"
  moss-muted: "#abb5aa"
  control-line: "#6a796d"
  hairline: "#374239"
  focus-amber: "#ffd37a"
  accent-lime: "#c4ed8e"
  accent-ink: "#151a13"
  series-slate: "#babec4"
  series-ink: "#2c2a26"
  world-sage: "#a5c695"
  world-lavender: "#c4b3db"
  world-butter: "#d7b975"
  world-sky: "#97c2d8"
  world-raspberry: "#e0aebe"
  world-coral: "#eab09e"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.12
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.1
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  reading:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.16em"
rounded:
  sm: "16px"
  md: "22px"
  cover: "26px"
  pill: "999px"
spacing:
  gutter: "16px"
  tap: "44px"
  tap-lg: "56px"
  page-max: "44rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-lime}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-primary-large:
    backgroundColor: "{colors.accent-lime}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "56px"
  button-default:
    backgroundColor: "{colors.hearth-raised}"
    textColor: "{colors.lantern-text}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  card-continue:
    backgroundColor: "{colors.hearth-surface}"
    textColor: "{colors.lantern-text}"
    rounded: "{rounded.md}"
    padding: "20px"
  search-box:
    backgroundColor: "{colors.hearth-surface}"
    textColor: "{colors.lantern-text}"
    rounded: "{rounded.sm}"
    height: "56px"
---

# Design System: Stories

## Overview

**Creative North Star: "The Quiet Hearth"**

A low-lit fireside that suits any hour of the day. Surfaces are dark and faintly green, like a room with the lamp turned down, and the only light comes from the stories themselves: covers glow in their series colour, and one soft lime accent marks what to press. Nothing shouts, moves for its own sake, or asks for attention.

Density is generous. Targets are large (56px for primary controls, 44px for everything else), type is never small, and each screen has one obvious next thing. Georgia carries story titles and the story text; the system sans carries everything you operate. Dark is the only theme.

Confirmed rejections: no bright kids-app primaries, no cartoon colour, confetti or mascots; no light mode; no bouncing, flashing or attention-grabbing motion.

**Key Characteristics:**
- Dark, green-tinted tonal layers instead of shadows.
- One lime accent per screen, used as a fill with dark ink; pastel world and series colours appear as glows and tints.
- Pills and soft 16-26px corners everywhere; nothing sharp.
- Line-icon covers on a tinted gradient tile; the icon is the art.
- System fonts and Georgia only; no network requests.

## Colors

A night-garden palette: near-black green neutrals, one fresh lime accent, and pastel world colours that tint rather than fill.

### Primary
- **Hearth Lime** (#c4ed8e): the default accent. Primary buttons, active nav tint, progress fills, the round play button. Always paired with Accent Ink (#151a13). A world can replace it with a pastel from the vetted palette via `--accent`.

### Secondary (world and series accents)
- **Sage** (#a5c695), **Lavender** (#c4b3db), **Butter** (#d7b975), **Sky** (#97c2d8), **Raspberry** (#e0aebe), **Coral** (#eab09e): the fixed vetted `PALETTE`. A world picks one by name for UI chrome; a series picks one for its story header and cover glow only. All carry dark Series Ink (#2c2a26) when used as a fill.
- **Neutral Slate** (#babec4): the default series colour for standalone stories.

### Neutral
- **Hearth Night** (#101411): page background.
- **Hearth Surface** (#1a211c): cards, rows, inputs, series groups.
- **Hearth Raised** (#232b25): default buttons, tracks, the far end of card gradients.
- **Panel Deep** (#20291f): the dark end of the Continue card gradient.
- **Lantern Text** (#f1f2e9): primary text.
- **Story Text** (#e6e7dd): the reading column, slightly softer than UI text.
- **Moss Muted** (#abb5aa): secondary text, eyebrows, meta; 4.5:1 or better on every surface.
- **Control Line** (#6a796d): borders of inputs, seek tracks, outlines; 3:1 against every surface.
- **Hairline** (#374239): decorative card edges and row dividers only. Nothing relies on seeing it.
- **Focus Amber** (#ffd37a): the keyboard focus ring.

### Named Rules
**The One Lime Rule.** The accent marks what to press or what is playing. It is never decoration, and a screen has one primary accent fill.
**The Vetted Colour Rule.** Colours come from the fixed palette or the tokens file, never generated. A new pair must pass `scripts/check-token-contrast.mjs` before it is added.
**The Hairline Honesty Rule.** Anything a person must find to use goes in Control Line. Hairline is only for edges that could vanish without harm.

## Typography

**Display Font:** Georgia (with Times New Roman, serif)
**Body Font:** system-ui (with -apple-system, Segoe UI, Roboto, sans-serif)

**Character:** A storybook serif for titles and the text itself, a plain sans for everything you tap. System fonts keep it fast and private.

### Hierarchy
- **Display** (500, 2rem, 1.12): story and page titles.
- **Headline** (500, 1.75rem, 1.1): Continue card title, player title, page titles in lists.
- **Title** (700, 1.125rem, 1.25): section heads and tile names, in sans.
- **Body** (400, 1.125rem, 1.55): interface text and descriptions.
- **Reading** (400, 1.25rem x text-size scale 0.9 / 1 / 1.25, 1.7, Georgia): the story text, capped at 65ch.
- **Label** (700, 0.75rem, 0.16em, uppercase): eyebrows, kickers, part labels. Nothing goes below 12px.

### Named Rules
**The Two Voices Rule.** Serif is for stories (titles, text); sans is for operating the app. Do not use serif for buttons or sans for story text.
**The Floor Rule.** Body is at least 16px, labels at least 12px, with no exceptions for density.

## Layout

A single centred column, max 44rem, with a 16px gutter (24px from 720px up). Phone first; the dock is fixed at the bottom with the page padded clear of it (dock height plus 2rem, plus the mini-player row when it is showing). Vertical rhythm comes from 0.75rem gaps between cards and 1.75rem above section heads. Chip rows scroll sideways and bleed to the screen edge so a half-visible chip signals more.

From 720px the Story hero becomes a two-column grid (16rem cover, then text) and the Continue card's cover grows to 8rem. In landscape under 480px tall, and at 200% zoom, the dock becomes non-fixed so it never covers content. Home leads with the Continue card, then a three-up "Played lately" grid, then world tiles; Library is search, chips, then series cards.

### Named Rules
**The Never-Cover Rule.** Fixed chrome must yield to content in short viewports and zoom.

## Elevation & Depth

Tonal layering, not shadows. Depth comes from stacking Hearth Night, Surface and Raised, usually as a 135-degree gradient from Surface to Raised, plus a soft radial glow in the accent or series colour at a card's corner. The dock is frosted (94% Night with a 12px blur) on a pseudo-element. The only true shadow belongs to the round play button.

### Shadow Vocabulary
- **Play glow** (`box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 28%, transparent)`): the 72px player play button only.
- **Icon glow** (`filter: drop-shadow(0 0 7px color-mix(in srgb, var(--series) 55%, transparent))`, larger on bigger covers): the line icon on a cover, so the icon reads as the light source.
- **Inset cover edge** (`inset 0 0 0 1px color-mix(in srgb, var(--series) 18%, transparent)`): defines a cover tile without a border.

### Named Rules
**The Glow Is The Story Rule.** Glow belongs to covers and the play button. Cards and chrome do not glow.

## Shapes

Soft and round. Pills (999px) for every button, chip, nav link and badge; 22px for cards and world tiles; 16px for inputs, rows' covers and smaller panels; 14-20px for small and medium cover tiles, 26px for the large story and player covers. Borders are 1px Hairline on cards. Covers are gradient tiles with a centred line icon, never illustrations.

## Components

### Buttons
- **Shape:** full pill (999px), minimum 44px tall and wide; large variant 56px.
- **Primary:** Hearth Lime fill, Accent Ink text, weight 750.
- **Default:** Hearth Raised fill, Lantern Text, 1px Hairline border.
- **Pressed / current:** a 20% accent tint over Surface with an accent border; primary stays solid.
- **Quiet:** transparent with accent text, for "show more".
- **Focus:** a 3px Focus Amber outline with 3px offset on everything. **Disabled:** 60% opacity.

### Chips
- **Style:** the default button, but transparent with Moss Muted text, in a sideways-scrolling row.
- **State:** pressed gets the accent tint and border with Lantern Text.

### Cards / Containers
- **Corner Style:** 22px.
- **Background:** Surface-to-Raised gradient; the Continue card adds an accent glow at the top right.
- **Border:** 1px Hairline.
- **Internal Padding:** 1.25rem for the hero card, about 1rem elsewhere.

### Inputs / Fields
- **Style:** Surface fill, 1px Control Line border, 16px radius, 56px tall, magnifier icon at left.
- **Focus:** the global Focus Amber ring. The seek slider uses a 6px track filled in the accent over Raised, with a 24px accent thumb ringed in the page colour.

### Navigation
A two-item dock (Home, Library) with an icon and label side by side. Inactive links are Moss Muted; the current page is accent text on a 14% accent tint, pill-shaped. The mini-player sits above as a pill: a title/time button that opens the sheet, skip back, a 48px round accent play button, skip forward.

### Cover Tile (signature)
A square or portrait gradient tile tinted by the series colour, with a glowing line icon that has a faint filled body and rounded 3-5 stroke. It appears at every size, from 3.5rem rows to the full-width story and player covers. The icon is the artwork; there are no illustrations.

### World Tile
A card with a 4rem glowing icon tile, a bold world name, a small tagline and an arrow. The selected world gets a tinted gradient and an accent border, and the arrow becomes a tick.

## Do's and Don'ts

### Do:
- **Do** use 56px for primary controls (play, seek, Continue) and at least 44px for everything else.
- **Do** keep one lime fill per screen and let pastel series colours appear as glows and tints.
- **Do** build depth from the tonal stack (Night, Surface, Raised) and soft radial glows.
- **Do** honour `prefers-reduced-motion`; motion is a 0.2s sheet slide and 0.15s chevrons only.
- **Do** read every colour from `tokens.css`; new pairs must pass `scripts/check-token-contrast.mjs`.

### Don't:
- **Don't** use bright primary colours, cartoon styling, confetti or mascots.
- **Don't** add a light theme, or bouncing, flashing or looping motion.
- **Don't** use Hairline for anything a person needs to find; use Control Line.
- **Don't** put text below 12px or body below 16px, or use external fonts or other network requests.
- **Don't** put pastel world colours behind light text; they carry dark Series Ink.
- **Don't** nest accent fills or add glows to cards and chrome.
