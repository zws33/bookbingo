/**
 * Data-Access Layer
 *
 * This module defines a standard interface for interacting with the
 * application's data, regardless of the underlying storage mechanism.
 *
 * Implementations of this interface are responsible for handling the
 * persistence of users and their book collections. This abstraction
 * allows the core application logic to remain decoupled from the
 * details of data storage, making it easy to swap out different
 * storage solutions (e.g., in-memory, file-based, database) without
 * affecting the business logic.
 */

// Re-export types from the shared types module
export type { User, UserBook, DataAccess } from '@lib/types/index.js';
