import { randomUUID } from 'crypto';

/**
 * @type {import('./index.js').User[]}
 */
const users = [];

/**
 * @type {import('./index.js').UserBook[]}
 */
const books = [];

/**
 * An in-memory implementation of the data access layer.
 *
 * @type {import('./index.js').DataAccess}
 */
export const memory = {
  async getAllUsers() {
    return users;
  },

  async getUserById(id) {
    return users.find((user) => user.id === id);
  },

  async createUser(name) {
    const newUser = {
      id: randomUUID(),
      name,
      createdAt: new Date(),
    };
    users.push(newUser);
    return newUser;
  },

  async getBooksByUserId(userId) {
    return books.filter((book) => book.userId === userId);
  },

  async createBook(book) {
    const newBook = {
      id: randomUUID(),
      ...book,
    };
    books.push(newBook);
    return newBook;
  },

  /**
   * Resets all in-memory data. For testing only.
   * @private
   */
  _reset() {
    users.length = 0;
    books.length = 0;
  },
};
