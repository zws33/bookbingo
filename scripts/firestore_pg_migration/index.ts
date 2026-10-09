import { createClient } from '../lib/db.js';
import {
  initApp,
  parseFlag,
  resolveClaimUid,
  STAGING_PROJECT_ID,
} from '../lib/admin.firebase.js';
import { migrateUsers } from './users.js';
import { migrateBooks } from './books.js';
import { migrateChallenge } from './challenges.js';
import { migrateTags } from './tags.js';
import { DEFAULT_CHALLENGE_NAME } from './constants.js';

const projectId = parseFlag('project') ?? STAGING_PROJECT_ID;
const challengeName = parseFlag('challenge-name') ?? DEFAULT_CHALLENGE_NAME;
const ownerEmail = parseFlag('owner') ?? 'zach.smith33@gmail.com';
const ownerUid = parseFlag('owner-uid');

async function main() {
  const { db: firestore, auth } = initApp(projectId);
  const ownerId = await resolveClaimUid(auth, {
    email: ownerEmail,
    uid: ownerUid,
  });
  if (!ownerId) throw new Error('Could not resolve an owner uid.');

  const pgClient = createClient();
  await pgClient.connect();

  try {
    console.log(`users: ${await migrateUsers(firestore, pgClient)}`);

    const bookIds = await migrateBooks(firestore, pgClient);
    console.log(`books: ${bookIds.length}`);

    const challenge = await migrateChallenge(pgClient, {
      name: challengeName,
      ownerId,
    });
    console.log(
      `challenge: ${challengeName} (join code ${challenge.joinCode}), ` +
        `members: ${challenge.memberCount}`,
    );

    const tagIdsByTile = await migrateTags(pgClient);
    console.log(`tags: ${tagIdsByTile.size}`);
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
