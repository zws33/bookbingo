# Web test conventions

How we write component and hook tests in `app/web`. These rules exist so any
agent or contributor produces tests that read the same way and fail for the
right reasons. `BookForm.test.tsx` is the reference example — when in doubt,
copy its shape.

Stack: **Vitest + @testing-library/react + @testing-library/user-event**, jsdom
environment. Render through `../testing/test-utils` (wraps `BrowserRouter` +
`ToastProvider`), never `@testing-library/react`'s bare `render`.

## The rules

1. **Interact only through `userEvent`.** Never `fireEvent`, never a manual
   `act()`. `fireEvent.change` sets a value directly and skips the
   focus/keydown/input sequence a real user triggers, so it can pass while the
   real interaction fails. `userEvent`'s awaited API already wraps state updates
   in `act` — reaching for `act()` yourself is a signal you're using the wrong
   tool. Call `userEvent.setup()` once per test.

2. **Query by accessibility, in priority order:** `getByRole(role, { name })`
   first, then `getByLabelText`, then `getByText`. Never write an OR-regex query
   like `/steps to reproduce|description/i` — if you can't name the element
   unambiguously, the component needs an accessible name, not the test a looser
   matcher. Prefer exact-string names; reserve regex for genuine substring needs
   (e.g. a composite accessible name).

3. **Assert observable outcomes only** — what the user sees (a disabled button,
   a "Saving…" label, the presence or absence of an input) and what crosses the
   component boundary (the exact `onSubmit` payload or service-call arguments).
   Never assert on internal state or implementation details.

4. **Isolate by construction.** Build fresh props and spies per test via a
   `renderThing(overrides)` factory that returns the interaction handles it
   creates (`user`, `onSubmit`, …). No `vi.fn()` shared at module scope, no
   reliance on `clearAllMocks()` to undo cross-test bleed.

5. **Mock only at the I/O boundary, and minimally.** A component you can test
   with _zero_ mocks (like `BookForm`) has no hidden coupling — treat that as the
   gold standard. When a component forces heavy mocking, first ask whether the
   component should be pushing that I/O to its edges. For consumers, mock the
   service/hook seam (`../lib/books`, `useTBR`) and assert the contract the
   refactor must preserve.

6. **One behavior per test; name the behavior.** `it('trims title and author in
the submitted payload')`, not `it('works')`. Structure Arrange → Act →
   Assert. Pin boundaries explicitly: trimming, whitespace-only-invalid, the
   exact tile-limit edge (3rd allowed, 4th blocked).

7. **Async is deterministic.** Use `findBy*` / `await waitFor(...)` for pending
   UI. Never an arbitrary timeout.

## Anti-patterns (do not copy from older tests)

- Mixing `fireEvent` and `userEvent` in one file.
- Wrapping fills in `await act(async () => …)`.
- Module-scoped shared mock functions.
- `getByText('exact product copy')` where a role query would do — it couples the
  test to wording that isn't the thing under test.
