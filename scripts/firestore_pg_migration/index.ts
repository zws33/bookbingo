import {
  createClient,
  describeTarget,
  resolveDatabaseTarget,
} from '../lib/db.js';
import {
  hasFlag,
  initApp,
  parseFlag,
  STAGING_PROJECT_ID,
} from '../lib/admin.firebase.js';
import { migrateUsers } from './users.js';
import { migrateBooks } from './books.js';
import { migrateChallenge } from './challenges.js';
import { migrateTags } from './tags.js';
import { migrateReadings } from './readings.js';
import { migrateTbrEntries } from './tbr.js';
import { formatCounts } from './counts.js';
import { DEFAULT_CHALLENGE_NAME, DEFAULT_OWNER_UID } from './constants.js';

const projectId = parseFlag('project') ?? STAGING_PROJECT_ID;
const challengeName = parseFlag('challenge-name') ?? DEFAULT_CHALLENGE_NAME;
const ownerId = parseFlag('owner-uid') ?? DEFAULT_OWNER_UID;
const prune = !hasFlag('no-prune');

async function main() {
  const destination = resolveDatabaseTarget(process.argv.slice(2));
  const { db: firestore } = initApp(projectId);

  console.log(
    `destination: ${describeTarget(destination.url)} (from ${destination.source})`,
  );
  console.log(`prune: ${prune ? 'on' : 'off (--no-prune)'}`);

  const pgClient = createClient(destination.url);
  await pgClient.connect();

  try {
    console.log(
      `users: ${formatCounts(await migrateUsers(firestore, pgClient))}`,
    );

    const books = await migrateBooks(firestore, pgClient, { prune });
    console.log(`books: ${formatCounts(books.books)}`);
    console.log(`book external refs: ${formatCounts(books.refs)}`);

    const challenge = await migrateChallenge(pgClient, {
      name: challengeName,
      ownerId,
    });
    console.log(
      `challenge: ${challenge.name} (join code ${challenge.joinCode ?? 'none'}), ` +
        `members: ${challenge.memberCount} (${challenge.membersAdded} added)`,
    );

    const { tagIdsByTile, counts } = await migrateTags(pgClient);
    console.log(`tags: ${formatCounts(counts)}`);

    const readings = await migrateReadings(firestore, pgClient, tagIdsByTile, {
      prune,
    });
    console.log(`readings: ${formatCounts(readings.readings)}`);
    console.log(`reading tags: ${formatCounts(readings.tags)}`);

    const tbr = await migrateTbrEntries(firestore, pgClient, tagIdsByTile, {
      prune,
    });
    console.log(`tbr entries: ${formatCounts(tbr.entries)}`);
    console.log(`tbr entry tags: ${formatCounts(tbr.tags)}`);
  } finally {
    await pgClient.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) console.error(error.cause);
  process.exitCode = 1;
}
