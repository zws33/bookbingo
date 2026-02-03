//
// Data-Access Layer
//
// This module defines a standard interface for interacting with the
// application's data, regardless of the underlying storage mechanism.
//
// Implementations of this interface are responsible for handling the
// persistence of users and their book collections. This abstraction
// allows the core application logic to remain decoupled from the
// details of data storage, making it easy to swap out different
// storage solutions (e.g., in-memory, file-based, database) without
// affecting the business logic.
//

/**
 * @typedef {Object} User
 * @property {string} id - The unique identifier for the user.
 * @property {string} name - The name of the user.
 * @property {Date} createdAt - The timestamp when the user was created.
 */

/**
 * @typedef {Object} UserBook
 * @property {string} id - The unique identifier for the book.
 * @property {string} userId - The ID of the user who owns the book.
 * @property {string} title - The title of the book.
 * @property {string} author - The author of the book.
 * @property {string[]} tiles - An array of tile IDs associated with the book.
 * @property {boolean} isFreebie - Whether the book is a "freebie".
 * @property {Date} readAt - The timestamp when the book was read.
 */

/**
 * @typedef {Object} DataAccess
 * @property {() => Promise<User[]>} getAllUsers - Retrieves all users.
 * @property {(id: string) => Promise<User | undefined>} getUserById - Retrieves a user by their ID.
 * @property {(name: string) => Promise<User>} createUser - Creates a new user.
 * @property {(userId: string) => Promise<UserBook[]>} getBooksByUserId - Retrieves all books for a given user.
 * @property {(book: Omit<UserBook, 'id'>) => Promise<UserBook>} createBook - Adds a new book for a user.
 */
