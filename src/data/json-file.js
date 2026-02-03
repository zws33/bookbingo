import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

// Simple file-based JSON database
const DB_PATH = path.resolve('book-bingo.db.json');

/**
 * @type {import('./index.js').DataAccess}
 */
export const jsonFile = {
  async getAllUsers() {
    const db = await this._readDb();
    return db.users;
  },

  async getUserById(id) {
    const db = await this._readDb();
    return db.users.find((user) => user.id === id);
  },

  async createUser(name) {
    const db = await this._readDb();
    const newUser = {
      id: randomUUID(),
      name,
      createdAt: new Date(),
    };
    db.users.push(newUser);
    await this._writeDb(db);
    return newUser;
  },

  async getBooksByUserId(userId) {
    const db = await this._readDb();
    return db.books.filter((book) => book.userId === userId);
  },

  async createBook(book) {
    const db = await this._readDb();
    const newBook = {
      id: randomUUID(),
      ...book,
    };
    db.books.push(newBook);
    await this._writeDb(db);
    return newBook;
  },

  /**
   * @private
   * Reads the database file.
   * @returns {Promise<{users: import('./index.js').User[], books: import('./index.js').UserBook[]}>}
   */
  async _readDb() {
    try {
      const data = await fs.readFile(DB_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { users: [], books: [] };
      }
      throw error;
    }
  },

  /**
   * @private
   * Writes to the database file.
   * @param {object} data
   */
  async _writeDb(data) {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
  },
};
