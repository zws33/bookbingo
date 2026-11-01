import { createCallable } from 'src/lib/callable';
import { ScoreSchema, type Score } from 'src/types/schemas';

export const getScore = createCallable<
  { challengeId: string; userId: string },
  Score
>('getScore', ScoreSchema);
