# Canvas UI components

## The landing footer's random effect

Layering two Canvas UI effects on one footer never worked (see "Nesting
history" below), so the landing footer (`Footer.jsx`) instead wears exactly
one effect, chosen at random from `FOOTER_FX_EFFECTS` each time the landing
page mounts. Every candidate wraps the real footer DOM the same way
(`mode="measure"` in `CanvasFxLayer`), so adding/removing a roster entry never
touches the surrounding markup — it only changes which shader captures it.
The candidates are Droplets (customized), Glass, Blaze, Bubble, Liquid,
Magnify, Glyph Rain, and Particle Reveal, each vendored below.

`Blaze.tsx` is copied from the Canvas UI registry:

- Source: <https://canvasui.dev/r/blaze-react.json>
- Component: Blaze (React)
- Retrieved: 2026-08-15
- License: MIT + Commons Clause (the component may not be resold or redistributed as a component)
- Used both in the landing hero (`FireLayer.jsx`, `distortion: 0.6`) and as one
  of the footer's random effects (`sparkColor`/`smokeColor` recolored to white
  so it reads as light rather than fire on a dark footer).

The source is intentionally kept upstream-shaped. The only source change is
removing the first-line Next.js `"use client"` directive because this app is a
Vite React app.

`Glass.tsx` is a Vite-compatible local adaptation of Canvas UI's Glass lens:

- Source reference: <https://canvasui.dev/docs/components/glass>
- Component: Glass (React)
- Uses the HTML-in-canvas capability gate and `data-glass-target` zoom contract;
  the shader stays local so the footer has no runtime package dependency.
- One of the footer's random effects, used at its documented defaults. The
  `data-glass-target` per-element zoom attributes were removed from the footer
  markup in an earlier session, so its hover-follow zoom has no explicit
  targets — the base capture/refraction still renders.

`Droplets.tsx`, `Bubble.tsx`, `Liquid.tsx`, `Magnify.tsx`, `GlyphRain.tsx`,
and `ParticleReveal.tsx` are copied from the Canvas UI registry:

- Sources: <https://canvasui.dev/r/droplets-react.json>,
  <https://canvasui.dev/r/bubble-react.json>,
  <https://canvasui.dev/r/liquid-react.json>,
  <https://canvasui.dev/r/magnify-react.json>,
  <https://canvasui.dev/r/glyph-rain-react.json>, and
  <https://canvasui.dev/r/particle-reveal-react.json>
- Components: Droplets, Bubble, Liquid, Magnify, GlyphRain, ParticleReveal (all React)
- Retrieved: 2026-08-16
- License: MIT + Commons Clause (same terms as Blaze — see above)
- Source is upstream-shaped; the only change is removing the first-line
  Next.js `"use client"` directive, same as Blaze.
- All six are wired into the footer's random roster:
  - **Droplets** keeps its original hand-tuned options (ambient rain,
    `interactive: true` lets the cursor wipe drops off the text).
  - **Bubble** runs at its documented example defaults.
  - **Liquid** recolors the default blue trail to a neutral gray
    (`color: [0.7, 0.7, 0.7]`); everything else is default.
  - **Magnify** runs at its documented defaults (cursor-follow zoom lens).
  - **GlyphRain** recolors the default blue rain to achromatic white/gray
    (`color`/`headColor`); everything else is default.
  - **ParticleReveal** runs at its documented defaults.

### Nesting history (don't retry blind)

A second Bubble layer was once tried stacked on top of Droplets for a
cursor-trailing droplet, and dropped twice: nesting one `CanvasFxLayer` inside
the other broke outright (Chrome's html-in-canvas capture doesn't composite a
live layoutsubtree canvas that sits inside another one — the inner layer
stayed fully mounted/active but never visually appeared), and running it as a
sibling with its own `aria-hidden`/`inert` copy of the footer content to
refract left its lazy `mode="measure"` IntersectionObserver activation stuck
inactive in testing in a way that wasn't fully root-caused. This is why the
footer now picks one effect at random instead of layering several — see
`Footer.jsx` before retrying either nesting approach.

## Updating a vendored component

When updating, fetch `files[0].content` from the registry URL (e.g.
`https://canvasui.dev/r/<slug>-react.json`), replace the checked-in file,
remove only the first `"use client"` line, then run the web build and inspect
the Landing page with the HTMLInCanvas Origin Trial enabled.

`FireLayer.jsx` is repository code. It gates Blaze on HTML-in-Canvas support,
desktop width, reduced-motion preference, and viewport visibility, and keeps
the layout height explicit after Blaze moves content into its canvas subtree.
