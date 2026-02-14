import { randomUUID } from 'crypto';
import type { User, UserBook, DataAccess } from '@lib/types/index.js';

/**
 * Extended interface for the memory store that includes test utilities.
 */
export interface MemoryDataAccess extends DataAccess {
  /** Resets all in-memory data. For testing only. */
  _reset(): void;
}

const users: User[] = [];
const books: UserBook[] = [];

/**
 * An in-memory implementation of the data access layer.
 */
export const memory: MemoryDataAccess = {
  async getAllUsers(): Promise<User[]> {
    return users;
  },

  async getUserById(id: string): Promise<User | undefined> {
    return users.find((user) => user.id === id);
  },

  async createUser(name: string): Promise<User> {
    const newUser: User = {
      id: randomUUID(),
      name,
      createdAt: new Date(),
    };
    users.push(newUser);
    return newUser;
  },

  async getBooksByUserId(userId: string): Promise<UserBook[]> {
    return books.filter((book) => book.userId === userId);
  },

  async createBook(book: Omit<UserBook, 'id'>): Promise<UserBook> {
    const newBook: UserBook = {
      id: randomUUID(),
      ...book,
    };
    books.push(newBook);
    return newBook;
  },

  _reset(): void {
    users.length = 0;
    books.length = 0;
  },
};
