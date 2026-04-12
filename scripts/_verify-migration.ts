import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const projectFlagIndex = args.indexOf('--project');
if (projectFlagIndex === -1 || !args[projectFlagIndex + 1]) {
  console.error('Error: --project <project-id> is required.');
  process.exit(1);
}
const PROJECT_ID = args[projectFlagIndex + 1];

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const [readingsSnap, booksSnap] = await Promise.all([
  db.collectionGroup('readings').get(),
  db.collection('books').get(),
]);

const bookIds = new Set(booksSnap.docs.map((d) => d.id));

console.log('=== Books in /books/ ===');
for (const doc of booksSnap.docs) {
  const d = doc.data();
  console.log(`  ${doc.id}: "${d.title}" by ${d.author} (createdBy: ${d.createdBy})`);
}

console.log('\n=== Readings ===');
let allHaveBookId = true;
let allResolve = true;
for (const doc of readingsSnap.docs) {
  const d = doc.data();
  const hasId = !!d.bookId;
  const resolves = hasId && bookIds.has(d.bookId);
  if (!hasId) allHaveBookId = false;
  if (!resolves) allResolve = false;
  const status = !hasId ? '[MISSING bookId]' : !resolves ? '[UNRESOLVED bookId]' : '[OK]';
  console.log(`  ${status} ${doc.ref.path} -> ${d.bookId ?? 'none'}`);
}

console.log('\n=== Summary ===');
console.log(`  Total readings:       ${readingsSnap.size}`);
console.log(`  Total books:          ${booksSnap.size}`);
console.log(`  All have bookId:      ${allHaveBookId}`);
console.log(`  All bookIds resolve:  ${allResolve}`);
console.log(`  Migration complete:   ${allHaveBookId && allResolve}`);
