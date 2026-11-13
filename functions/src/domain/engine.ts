import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';

export type ScoringEngine = (inputs: ScoringInput[]) => ScoreBreakdown;
