export interface UserProfile {
  id: string;
  name: string;
  photoURL?: string;
}

export interface Reading {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  tiles: string[];
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}
