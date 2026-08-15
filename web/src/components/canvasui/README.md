# Canvas UI components

`Blaze.tsx` is copied from the Canvas UI registry:

- Source: <https://canvasui.dev/r/blaze-react.json>
- Component: Blaze (React)
- Retrieved: 2026-08-15
- License: MIT + Commons Clause (the component may not be resold or redistributed as a component)

The source is intentionally kept upstream-shaped. The only source change is
removing the first-line Next.js `"use client"` directive because this app is a
Vite React app.

## Updating Blaze

When updating, fetch `files[0].content` from the registry URL, replace the
checked-in file, remove only the first `"use client"` line, then run the web
build and inspect the Landing page with the HTMLInCanvas Origin Trial enabled.

`FireLayer.jsx` is repository code. It gates Blaze on HTML-in-Canvas support,
desktop width, reduced-motion preference, and viewport visibility, and keeps
the layout height explicit after Blaze moves content into its canvas subtree.
