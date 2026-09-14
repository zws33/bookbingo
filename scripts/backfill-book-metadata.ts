/**
 * Book Metadata Backfill: match `/books` docs with empty metadata against
 * Open Library, review the matches by hand, then apply them.
 *
 * See docs/book-metadata-backfill-plan.md.
 *
 * Usage:
 *   tsx scripts/backfill-book-metadata.ts match --project <id>
 *   tsx scripts/backfill-book-metadata.ts apply --project <id> --report <path> [--dry-run] [--allow-prod]
 *
 * `match` never writes to Firestore — it writes a report to
 * scripts/out/metadata-matches.<project>.json for review. `apply` writes only
 * the `metadata` field, and only for entries whose status is not "skip".
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod/v4';
import type { BookMetadata } from '@bookbingo/lib-types';
import { OpenLibraryProvider } from '../functions/src/books/providers/open-library.js';
import {
  initApp,
  parseFlag,
  hasFlag,
  guardOrConfirmProdWrite,
} from './lib/admin.js';
import {
  cleanQuery,
  scoreCandidate,
  isEmptyMetadata,
  type MatchStatus,
  type ScoreResult,
} from './lib/matching.js';

interface ReportEntry {
  bookId: string;
  title: string;
  author: string;
  olKey: string | null;
  olTitle: string | null;
  olAuthor: string | null;
  score: number | null;
  status: MatchStatus | 'skip';
}

// =============================================================================
// Open Library tiered search (independent of OpenLibraryProvider.search,
// which only supports a single combined `q=` query — the tiers below need
// title=/author= as separate params).
// =============================================================================

const OL_SEARCH_URL = 'https://openlibrary.org/search.json';
const OL_HEADERS = { 'User-Agent': 'BookBingo/1.0 (zach.smith33@gmail.com)' };
/** ~1 req/s, so the search step is polite to a public, unauthenticated API. */
const SEARCH_DELAY_MS = 1000;

const SearchDocSchema = z.object({
  key: z.string(),
  title: z.string(),
  author_name: z.array(z.string()).optional(),
});
const SearchResponseSchema = z.object({ docs: z.array(SearchDocSchema) });

interface OlCandidate {
  olKey: string;
  title: string;
  author: string;
}

async function fetchSearch(
  params: Record<string, string>,
): Promise<OlCandidate[]> {
  const url = new URL(OL_SEARCH_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('fields', 'key,title,author_name');
  url.searchParams.set('limit', '5');

  const res = await fetch(url, { headers: OL_HEADERS });
  if (!res.ok) {
    throw new Error(
      `OpenLibrary search failed: ${res.status} ${res.statusText}`,
    );
  }
  const dto = SearchResponseSchema.parse(await res.json());
  return dto.docs.map((doc) => ({
    olKey: doc.key,
    title: doc.title,
    author: doc.author_name?.[0] ?? '',
  }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Search title+author, then title-only (author typos), then a combined `q=`
 * (title typos) — stopping at the first tier that yields a non-"none" match.
 * Tracks the best-scoring candidate seen across all tiers tried.
 */
async function findBestMatch(
  title: string,
  author: string,
): Promise<{ candidate: OlCandidate | null; result: ScoreResult }> {
  const cleaned = cleanQuery(title, author);
  const tiers: Record<string, string>[] = [
    { title: cleaned.titleNoSubtitle, author: cleaned.author },
    { title: cleaned.titleNoSubtitle },
    { q: `${cleaned.titleNoSubtitle} ${cleaned.author}` },
  ];

  let best: { candidate: OlCandidate | null; result: ScoreResult } = {
    candidate: null,
    result: { titleScore: 0, authorScore: 0, score: 0, status: 'none' },
  };

  for (const params of tiers) {
    const candidates = await fetchSearch(params);
    await sleep(SEARCH_DELAY_MS);

    for (const candidate of candidates) {
      const result = scoreCandidate({
        title,
        author,
        candidateTitle: candidate.title,
        candidateAuthor: candidate.author,
      });
      if (result.score > best.result.score) best = { candidate, result };
    }

    if (best.result.status !== 'none') break;
  }

  return best;
}

// =============================================================================
// match
// =============================================================================

async function runMatch(): Promise<void> {
  const projectId = parseFlag('project');
  if (!projectId) {
    console.error('Error: --project <project-id> is required.');
    process.exit(1);
  }

  const { db } = initApp(projectId);
  const snap = await db.collection('books').get();

  const entries: ReportEntry[] = [];
  const counts: Record<string, number> = { auto: 0, review: 0, none: 0 };

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isEmptyMetadata(data.metadata)) continue;

    const title: string = data.title ?? '';
    const author: string = data.author ?? '';
    const { candidate, result } = await findBestMatch(title, author);
    counts[result.status]!++;

    entries.push({
      bookId: doc.id,
      title,
      author,
      olKey: candidate?.olKey ?? null,
      olTitle: candidate?.title ?? null,
      olAuthor: candidate?.author ?? null,
      score: candidate ? result.score : null,
      status: result.status,
    });

    console.log(
      `  [${result.status.padEnd(6)}] ${title} — ${author}` +
        (candidate ? ` -> ${candidate.title} — ${candidate.author}` : ''),
    );
  }

  const outDir = path.join(import.meta.dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `metadata-matches.${projectId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));

  console.log(`\nWrote ${entries.length} entries to ${outPath}`);
  console.log(counts);
}

// =============================================================================
// apply
// =============================================================================

function toBookMetadata(
  details: Awaited<ReturnType<OpenLibraryProvider['getDetails']>>,
): BookMetadata {
  return {
    pageCount: details.pageCount,
    publishedDate: details.publishedDate,
    categories: details.categories,
    language: details.language,
    isbn: details.isbn,
    thumbnailUrl: details.thumbnailUrl,
  };
}

async function runApply(): Promise<void> {
  const projectId = parseFlag('project');
  const reportPath = parseFlag('report');
  const dryRun = hasFlag('dry-run');
  const allowProd = hasFlag('allow-prod');

  if (!projectId || !reportPath) {
    console.error(
      'Error: --project <project-id> and --report <path> are required.',
    );
    process.exit(1);
  }

  await guardOrConfirmProdWrite(projectId, allowProd);

  const entries: ReportEntry[] = JSON.parse(
    fs.readFileSync(reportPath, 'utf8'),
  );
  const { db } = initApp(projectId);
  const provider = new OpenLibraryProvider();

  const outcomes: Record<string, number> = {
    updated: 0,
    'skipped-manual': 0,
    'skipped-no-ol-key': 0,
    'skipped-not-found': 0,
    'skipped-already-enriched': 0,
    error: 0,
  };

  for (const entry of entries) {
    if (entry.status === 'skip') {
      outcomes['skipped-manual']!++;
      continue;
    }
    if (!entry.olKey) {
      outcomes['skipped-no-ol-key']!++;
      console.log(`  [no-ol-key] ${entry.bookId} (${entry.title})`);
      continue;
    }

    let metadata: BookMetadata;
    try {
      metadata = toBookMetadata(await provider.getDetails(entry.olKey));
    } catch (error) {
      outcomes.error!++;
      console.error(`  [error] ${entry.bookId} (${entry.olKey}):`, error);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY-RUN] would update ${entry.bookId} (${entry.title})`);
      outcomes.updated!++;
      continue;
    }

    const outcome = await db.runTransaction(async (tx) => {
      const ref = db.collection('books').doc(entry.bookId);
      const current = await tx.get(ref);
      if (!current.exists) return 'not-found';
      if (!isEmptyMetadata(current.data()?.metadata)) return 'already-enriched';
      tx.update(ref, { metadata });
      return 'updated';
    });

    outcomes[outcome === 'updated' ? 'updated' : `skipped-${outcome}`]!++;
    console.log(`  [${outcome}] ${entry.bookId} (${entry.title})`);
  }

  console.log('\nOutcomes:', outcomes);
}

// =============================================================================

async function main(): Promise<void> {
  const subcommand = process.argv[2];
  if (subcommand === 'match') return runMatch();
  if (subcommand === 'apply') return runApply();

  console.error(
    'Usage:\n' +
      '  tsx scripts/backfill-book-metadata.ts match --project <id>\n' +
      '  tsx scripts/backfill-book-metadata.ts apply --project <id> --report <path> [--dry-run] [--allow-prod]',
  );
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
