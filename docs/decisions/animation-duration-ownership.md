# Animation Duration Ownership

**Status:** Active
**Date:** 2026-04-24

## Context

When building animated UI components that pair a CSS transition with a React lifecycle hook, two representations of the same duration exist: a Tailwind class (e.g., `duration-200`) for the browser animation, and a `setTimeout` value for React state cleanup. These must stay in sync — if the cleanup fires before the animation completes, the component unmounts mid-transition and the exit animation is cut off.

This pattern appeared in the Radix Toast migration (Phase 3): `ui/Toast.tsx` defines a 200ms exit transition; `ToastContext.tsx` needs to wait that same 200ms before removing the dismissed toast from the queue.

## Options Considered

1. **Hardcode independently** — each location uses its own literal `200`. Simplest to write, but the coupling is silent. Changing the animation duration in the component won't break a build or test; it will just produce a visual glitch.

2. **Export a JS constant from the component module** — `ui/Toast.tsx` exports `TOAST_EXIT_DURATION_MS = 200`. Consumers import and use it for `setTimeout`. The Tailwind class (`duration-200`) remains a separate CSS assertion of the same value, but the JS side has a single source of truth. (Adopted.)

3. **Event-driven cleanup (`transitionend` / `animationend`)** — the component fires a callback when its exit transition ends; the caller removes the item from state in response. CSS owns the timing entirely; JS has no knowledge of the duration value. This is the architecture used by Framer Motion and `react-transition-group` at their core.

## Decision

Export `TOAST_EXIT_DURATION_MS` from `ui/Toast.tsx` and import it in `ToastContext.tsx`. The Tailwind class is the CSS assertion; the constant is the JS counterpart. A comment in the component co-locates both representations so the coupling is visible.

The event-driven approach was not adopted because it requires threading an `onRemove` callback through `ToastItem` and restructuring the `onOpenChange` handler in the context. For a single animated component on a hobby project, that complexity is not justified.

## Tradeoffs

- The exported constant eliminates silent drift on the JS side, but the Tailwind class is still a separate assertion. Changing `duration-200` to `duration-300` without updating the constant still produces a visual glitch — the constant does not make the CSS class redundant.
- The event-driven approach is the correct architecture at scale because it removes the JS/CSS coupling entirely. It also handles variable-duration transitions (e.g., spring animations) where a fixed constant cannot work.

## When to Revisit

Switch to the event-driven pattern when a second animated component with a lifecycle cleanup timer is added. At that point, exporting another constant compounds the coupling problem rather than solving it. The correct move is to consolidate on `transitionend` / `animationend` as the shared pattern.
