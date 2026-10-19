/**
 * The challenge data seam. Everything in the UI imports from here, so wiring
 * the real callables is a change to this file alone: replace each re-export
 * with a `createCallable` binding and delete `challenges.mock`.
 */
export {
  createChallenge,
  getChallenge,
  joinChallenge,
  leaveChallenge,
  listMyChallenges,
  updateChallengeConfig,
  MOCK_JOIN_CODE,
  MOCK_UID,
} from './challenges.mock';
