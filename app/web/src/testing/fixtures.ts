import type { Reading, UserProfile, Book } from '../types';

export function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: 'reading-1',
    bookId: 'book-1',
    tiles: ['sci-fi'],
    isFreebie: false,
    readAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    title: 'The Left Hand of Darkness',
    author: 'Ursula K. Le Guin',
    createdBy: 'user-1',
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
