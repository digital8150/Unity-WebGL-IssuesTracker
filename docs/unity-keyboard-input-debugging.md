# Unity WebGL keyboard input investigation

## Current findings

- The `/play` route does not mount a React or third-party hotkey listener that
  cancels ordinary `W`, `A`, `S`, or `D` keyboard events.
- The only application-level `keydown` listener is the dashboard modal's Escape
  handler. It is not mounted on the play route and does not cancel the event.
- The uploaded Unity framework registers Emscripten keyboard callbacks. Its
  JavaScript calls `preventDefault()` only when the Unity callback reports that
  it handled the event.
- `UnityGame.jsx` explicitly gives the canvas `tabIndex={1}`. The installed
  `react-unity-webgl` package documents this prop as a way to limit Unity's
  normal page-wide keyboard capture. This makes canvas focus and Unity's
  `WebGLInput.captureAllKeyboardInput` setting the leading suspects.
- `UnityGame.jsx` also sets `inputmode="none"` after load. This was added as an
  earlier IME workaround, but the issue now reproduces with an English input
  source and on macOS, so it cannot be considered an IME-only problem.

These findings do not yet prove whether the failure is caused by canvas focus,
the Unity project's `WebGLInput.captureAllKeyboardInput` value, or an event
listener that only exists in the deployed environment.

## Extension-resistant input capture

Some browser extensions stop ordinary keyboard events during the bubble phase.
Unity/Emscripten registers its `jsEventHandler` keyboard callbacks with
`capture: false` by default, so those callbacks can be skipped even though the
event reached the page.

The play host promotes only Unity's `keydown`, `keypress`, and `keyup`
`jsEventHandler` registrations on window and the Unity canvas to
`capture: true`. Other application and browser event listeners keep their
original options. Removal uses the same capture option, and all promoted
listeners are cleaned up when the Unity view unmounts.

## Collecting a diagnostic trace

1. Add `?unityKeyboardDebug=1` to the play URL. If the URL already has query
   parameters, add `&unityKeyboardDebug=1` instead.
2. Open DevTools Console and reload the page.
3. Click the Unity canvas and reproduce the failed `W/A/S/D` input.
4. Reproduce the IME/composition case that succeeds.
5. Run:

   ```js
   copy(window.__unityKeyboardDebug.export())
   ```

The exported JSON contains:

- `key`, `code`, `keyCode`, `isComposing`, and `defaultPrevented`
- the event target, active element, and composed path
- capture and bubble checkpoints across window, document, and canvas
- calls to `preventDefault`, `stopPropagation`, and
  `stopImmediatePropagation`, including their JavaScript stacks
- keyboard/composition listener registrations made after debug mode starts
- pointer and focus transitions
- the canvas `tabIndex`, `inputMode`, and focus state

Debug instrumentation is disabled unless the query parameter is present. It
does not intentionally cancel, redispatch, or synthesize input events.
