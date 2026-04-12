export interface UserProfile {
  id: string;
  name: string;
  photoURL?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  createdBy: string;
  createdAt: Date;
}

export interface Reading {
  id: string;
  bookId: string;
  tiles: string[];
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}
