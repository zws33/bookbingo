import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// jest-dom 7.0.1 augments vitest's pre-5 single-parameter `Matchers`, so its
// matchers do not merge into vitest 5's `Matchers<R, T>`. Drop this file once
// jest-dom ships vitest 5 support.
declare module 'vitest' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {}
}
