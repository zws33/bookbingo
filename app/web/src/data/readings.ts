import type { Reading } from "@bookbingo/lib-types";

import {
  collection,
  getDocs,
  orderBy,
  query,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";

export interface ReadingRepository {
  getReadingsByUser(userId: string): Promise<Reading[]>;
}
export async function getReadingsByUser(userId: string): Promise<Reading[]> {
  const q = query(
    collection(db, "users", userId, "readings"),
    orderBy("readAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map(toReading);
}

function toReading(doc: QueryDocumentSnapshot): Reading {
  const data = doc.data();
  return {
    id: doc.id,                       // ID is the key, not a stored field
    bookId: data.bookId,
    tiles: data.tiles,
    isFreebie: data.isFreebie,
    readAt: data.readAt.toDate(),      // Timestamp → Date
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}


