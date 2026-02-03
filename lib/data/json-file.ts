import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { User, UserBook, DataAccess } from '../types/index.js';

interface Database {
  users: User[];
  books: UserBook[];
}

// Simple file-based JSON database
const DB_PATH = path.resolve('book-bingo.db.json');

async function readDb(): Promise<Database> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data) as Database;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { users: [], books: [] };
    }
    throw error;
  }
}

async function writeDb(data: Database): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * A file-based JSON implementation of the data access layer.
 */
export const jsonFile: DataAccess = {
  async getAllUsers(): Promise<User[]> {
    const db = await readDb();
    return db.users;
  },

  async getUserById(id: string): Promise<User | undefined> {
    const db = await readDb();
    return db.users.find((user) => user.id === id);
  },

  async createUser(name: string): Promise<User> {
    const db = await readDb();
    const newUser: User = {
      id: randomUUID(),
      name,
      createdAt: new Date(),
    };
    db.users.push(newUser);
    await writeDb(db);
    return newUser;
  },

  async getBooksByUserId(userId: string): Promise<UserBook[]> {
    const db = await readDb();
    return db.books.filter((book) => book.userId === userId);
  },

  async createBook(book: Omit<UserBook, 'id'>): Promise<UserBook> {
    const db = await readDb();
    const newBook: UserBook = {
      id: randomUUID(),
      ...book,
    };
    db.books.push(newBook);
    await writeDb(db);
    return newBook;
  },
};
