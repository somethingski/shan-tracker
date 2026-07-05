# 山 · Shan — Design System

A personal training journal in the language of traditional Chinese ink landscape (山水, *shanshui*)
and restrained optical depth. Calm everywhere, including logging. Built to run offline on a phone.

---

## 1. Philosophy in one paragraph

The app is a handcrafted journal, not a dashboard. Ink on aged paper. Negative space is the
primary material; marks are placed, not scattered. Color is withheld until it means something.
Motion settles like ink meeting paper — it resolves quickly (never in your way mid-set) but with
weight and natural deceleration, never a bounce or an overshoot. The rank system, borrowed in
structure from a competitive game's ladder, is dissolved into this world: ranks are **seals**
(印章) pressed on the page, their tiers rendered in ink-washed mineral pigments, not neon.

---

## 2. Color system

Pigments drawn from ink painting and mineral colors (石色). Warm paper, soft black ink, one jade
accent used sparingly, and a metal for the highest achievements.

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#EDE6D6` | Base paper (aged xuan paper) |
| `--paper-deep` | `#E3DAC6` | Recessed paper, wells, insets |
| `--paper-hi` | `#F5F0E3` | Raised paper, card faces catching light |
| `--ink` | `#20211C` | Primary ink (near-black, warm) |
| `--ink-soft` | `#4A4B42` | Secondary text, worn ink |
| `--ink-faint` | `#8A897C` | Tertiary, captions, disabled |
| `--jade` | `#3E6B5E` | The single accent — active state, progress, confirmation |
| `--jade-deep` | `#2A4A40` | Jade pressed / focus ring |
| `--cinnabar` | `#9E4B3B` | Seal red — used ONLY for the rank seal + true PRs |
| `--bronze` | `#7A6A48` | Oxidized metal — dividers of consequence, high ranks |
| `--mist` | `rgba(237,230,214,0.6)` | Fog overlay for depth layering |

**Rules.** Jade is the only interactive accent; if everything is jade, nothing is. Cinnabar is
reserved — the rank seal and a genuine 1RM PR, nothing else, so it always means "something rare
happened." Never place cinnabar and jade adjacent at full saturation.

### Rank tier pigments (ink-washed, NOT the game's neon)

The Valorant tier *structure* (Iron→Radiant, 3 divisions) rendered as mineral washes:

| Tier | Pigment | Hex |
|---|---|---|
| Iron | charcoal ink | `#3D3A34` |
| Bronze | oxidized bronze | `#6E5A3A` |
| Silver | stone grey | `#8C8A82` |
| Gold | aged gold leaf | `#A98544` |
| Platinum | pale jade | `#5E8A7B` |
| Diamond | river blue-green | `#3F6E86` |
| Ascendant | deep pine | `#3A5E48` |
| Immortal | dark cinnabar | `#7E3B34` |
| Radiant | warm gold + paper glow | `#B78A3C` on `--paper-hi` |

---

## 3. Typography

Editorial, like a well-printed book — not futuristic, not startup, not gaming.

- **Display** — `"Cormorant Garamond", "Songti SC", serif`. High-contrast old-style serif for
  screen titles, the app mark, big numbers (weight lifted, 1RM). Used with restraint, generous
  size, tight leading.
- **Body / UI** — `"Spectral", "Songti SC", serif`. A screen-friendly serif with real texture;
  carries logs, labels, most reading. Serif body is the risk — it's what makes this feel like a
  journal, not an app.
- **Data / caption** — `"IBM Plex Mono", monospace`. Only for dense numeric fields (set × rep ×
  weight grids, dates, percentiles) where alignment matters.

Chinese fallbacks (`Songti SC` / `Noto Serif SC`) are intentional — the app mark and section
dividers use a Chinese character each (山 workout, 記 log, 印 rank, 徑 progress), so the CJK face
must be a serif that sits with the Latin.

Type scale (1.25 minor-third): 12 · 15 · 19 · 24 · 30 · 38 · 47 px. Numbers can break scale
upward (a logged weight is a hero).

---

## 4. Layout & tokens

- **Grid.** Single column on phone, generous outer margin (24px), content max 34rem. Asymmetry is
  deliberate: titles and seals sit off the left axis, never dead-center.
- **Spacing.** 4-based: 4 · 8 · 12 · 16 · 24 · 40 · 64. Negative space is a feature — screens
  breathe; never fill the column edge to edge.
- **Radii.** Small and dry: 2px default, 4px on pressable faces, 0px on dividers/seals. No pills,
  no big rounded cards.
- **Strokes.** 1px hairline `--ink-faint` at 40% for structure; 2px `--bronze` only for dividers
  that mean a section change (a "brushed" divider, see signature).
- **Shadow philosophy.** Almost none. Depth comes from paper tone shifts (`--paper-deep` wells,
  `--paper-hi` faces) and one soft long shadow (0 8 24 rgba(32,33,28,.10)) on a lifted modal only.
- **Blur.** Used once: the modal scrim is a light paper-mist blur (backdrop 6px), nowhere else.
- **Density.** Low. One primary action per screen. Logging is the exception and even there each
  set is a calm row, not a packed table.

---

## 5. Motion language

Calm, but never slow-to-respond. The feel is ink wicking into paper: quick contact, then a soft
settle. All easing uses one family.

- **Curves.** `--ease-settle: cubic-bezier(.22,.61,.36,1)` (primary, decelerating). No springs, no
  overshoot, no bounce anywhere.
- **Durations.** micro 140ms · standard 260ms · page 380ms · ambient (background drift) 20s loop.
- **Set logged.** The row's ink "wicks" — a 260ms jade underline draws left→right + weight number
  settles up 4px into place. That's the whole celebration for a normal set.
- **1RM PR.** Once, a cinnabar seal presses onto the page (scale 1.06→1, 380ms, one soft thud of
  opacity) and a single character 記 fades in. Rare by design.
- **Page transitions.** Outgoing fades + drifts up 8px; incoming paper rises 8px into place. 380ms.
- **Loading.** A single brushstroke draws across (SVG stroke-dashoffset), not a spinner.
- **Reduced motion.** All drift/wick replaced by simple 120ms opacity. Respected via media query.

---

## 6. Signature elements (the one memorable thing)

1. **The brushed divider.** Section breaks are a hand-drawn ink stroke (SVG path with tapered ends
   + slight dry-brush texture), not a line. It reappears as the calendar's day-separator and the
   analytics section rule — one motif, everywhere.
2. **The rank seal (印).** Each rank-bearing lift shows a small square seal in cinnabar outline
   with the tier pigment wash inside and the tier mark. Tapping it presses open the full ladder as
   a vertical scroll (a scholar's tier list), current division highlighted, peak marked with a
   faint bronze notch. This is where the game structure lives, fully absorbed into the ink world.

---

## 7. Component specs (abbreviated — full behavior in app)

- **Set row.** paper-hi face, mono weight/rep fields, a jade "wick" underline on commit, pain
  toggle = a small ink dot that fills, fun = 1–5 ink circles that fill on tap. Big touch targets
  (min 44px).
- **Habit checklist.** 8 rows, each a hand-drawn empty circle that takes an ink check (SVG draw,
  180ms) when tapped. A completed day draws a faint enso (circle) around the day's count.
- **Photo.** Framed like a pressed plate in the journal — thin bronze inset, paper mat. Capture is
  one tap; stored compressed. Selecting a past day shows that day's plate beside its logs.
- **Charts.** Ink-line only: 1px jade line, no fill gradients, no grid unless needed (then hairline
  faint). Axes are quiet mono. A PR point is a small cinnabar dot.
- **Modal.** Paper rises on a mist-blurred scrim; long-soft shadow; dismiss drifts down.

## 8. Voice

Plain, quiet, present-tense. Buttons say what happens ("Log set", "Save photo"). Empty states
invite ("No sets yet. Begin with the first."). Errors state the fact and the fix, no apology.
