import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
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
