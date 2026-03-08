import type { Reading, UserProfile } from '../types';

export function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: 'reading-1',
    bookId: 'book-1',
    bookTitle: 'The Left Hand of Darkness',
    bookAuthor: 'Ursula K. Le Guin',
    tiles: ['sci-fi'],
    isFreebie: false,
    readAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    name: 'Test User',
    ...overrides,
  };
}
