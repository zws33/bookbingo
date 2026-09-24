import type { CallableRequest } from 'firebase-functions/https';
import { requireAuth } from '../callable.js';

export function getChallengesCallback(request: CallableRequest<unknown>) {
  requireAuth(request, 'fetch challenges');
}
