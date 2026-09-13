import { z } from 'zod/v4';
import { initApp, PROD_PROJECT_ID } from './lib/admin.js';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'bookbingo-staging';
const { db } = initApp(PROJECT_ID);

const BookMetadata = z.object({
  pageCount: z.number().nullable(),
  publishedDate: z.string().nullable(),
  categories: z.array(z.string()),
  language: z.string().nullable(),
  isbn: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});

const BookDoc = z.object({
  title: z.string(),
  author: z.string(),
  // optional: a missing field is a result you branch on, not a parse failure
  metadata: BookMetadata.optional(),
});
type BookDoc = z.infer<typeof BookDoc>;

async function main() {
  const missingMetadataBooks = [];
  const snap = await db.collection('books').get();
  const outDir = path.join(import.meta.dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `missing-metadata-books.${PROD_PROJECT_ID}.json`,
  );
  for (const doc of snap.docs) {
    const result = BookDoc.safeParse(doc.data());
    if (!result.success) {
      throw Error(`result: ${result.error.message}`);
    }
    const book: BookDoc = result.data;
    if (!book?.metadata) {
      missingMetadataBooks.push({ title: book.title, author: book.author });
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(missingMetadataBooks, null, 2));

  console.log(`books with missing metadata: ${missingMetadataBooks.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
