import { createClient } from '../lib/db.js';
import {
  initApp,
  parseFlag,
  STAGING_PROJECT_ID,
} from '../lib/admin.firebase.js';
import { migrateUsers } from './users.js';

const projectId = parseFlag('project') ?? STAGING_PROJECT_ID;

async function main() {
  const { db: firestore } = initApp(projectId);
  const pgClient = createClient();
  await pgClient.connect();

  try {
    console.log(`users: ${await migrateUsers(firestore, pgClient)}`);
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
