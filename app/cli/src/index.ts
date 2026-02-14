import process from 'node:process';
import readline from 'readline';
import { jsonFile as db } from '@lib/data/json-file.js';
import core from '@lib/core/index.js';
import type { User } from '@lib/types/index.js';

interface ParsedArgs {
  user?: string;
  'add-book'?: boolean;
  [key: string]: string | boolean | undefined;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Seed the database with a default user if it's empty
  let users = await db.getAllUsers();
  if (users.length === 0) {
    await db.createUser('default');
    users = await db.getAllUsers();
  }

  let user = users[0];

  if (args.user) {
    const username = args.user;
    let foundUser = users.find((u: User) => u.name === username);
    if (!foundUser) {
      foundUser = await db.createUser(username);
    }
    user = foundUser;
  }

  if (args['add-book']) {
    await addBook(user);
  } else {
    await displayUserScore(user);
  }

  rl.close();
}

async function displayUserScore(user: User): Promise<void> {
  const books = await db.getBooksByUserId(user.id);
  const score = core.calculateScore(books);
  const stats = core.getScoreBreakdown(books);

  console.log(`Score for ${user.name}: ${score}`);
  console.log('---');
  console.log('Base Points:', stats.basePoints);
  console.log('Balance Multiplier:', stats.balanceMultiplier);
  console.log('Tile Counts:', stats.tileCounts);
}

async function addBook(user: User): Promise<void> {
  const title = await question('Title: ');
  const author = await question('Author: ');

  const newBook = {
    userId: user.id,
    title,
    author,
    tiles: [] as string[],
    isFreebie: false,
    readAt: new Date(),
  };

  await db.createBook(newBook);
  console.log(`Added "${title}" for ${user.name}.`);
}

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function parseArgs(args: string[]): ParsedArgs {
  const parsedArgs: ParsedArgs = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value === undefined) {
        parsedArgs[key] = true;
      } else {
        parsedArgs[key] = value;
      }
    }
  }
  return parsedArgs;
}

main().catch(console.error);
