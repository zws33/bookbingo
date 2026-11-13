import type { ScoringInput } from '@bookbingo/lib-types';

export function calculateTagCounts(
  inputs: ScoringInput[],
): Map<string, number> {
  const tagCounts = new Map<string, number>();
  for (const input of inputs) {
    for (const tagId of input.tags) {
      tagCounts.set(tagId, (tagCounts.get(tagId) || 0) + 1);
    }
  }
  return tagCounts;
}

/**
 * H(n) = 1 + 1/2 + 1/3 + ... + 1/n.
 *
 * Only `decay.test.ts` calls this: it is the closed form the calibration cases
 * pin the engine against, so the expected values are derived rather than
 * recorded. The engines sum their own terms.
 */
export function harmonicSum(n: number): number {
  if (n <= 0) {
    return 0;
  }
  let sum = 0;
  for (let k = 1; k <= n; k++) {
    sum += 1 / k;
  }
  return sum;
}
