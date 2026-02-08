import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function createReading(
  userId: string,
  title: string,
  author: string
): Promise<string> {
  const docRef = await addDoc(collection(db, 'users', userId, 'readings'), {
    bookTitle: title,
    bookAuthor: author,
    tiles: [],
    isFreebie: false,
    readAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateReading(
  userId: string,
  readingId: string,
  title: string,
  author: string
): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
    bookTitle: title,
    bookAuthor: author,
    updatedAt: serverTimestamp(),
  });
}
