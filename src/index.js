import process from 'node:process';
import readline from 'readline';
import { jsonFile as db } from './data/json-file.js';
import core from './core/index.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
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
    let foundUser = users.find(u => u.name === username);
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

async function displayUserScore(user) {
  const books = await db.getBooksByUserId(user.id);
  const score = core.calculateScore(books);
  const stats = core.getScoreBreakdown(books);

  console.log(`Score for ${user.name}: ${score}`);
  console.log('---');
  console.log('Base Points:', stats.basePoints);
  console.log('Balance Multiplier:', stats.balanceMultiplier);
  console.log('Tile Counts:', stats.tileCounts);
}

async function addBook(user) {
  const title = await question('Title: ');
  const author = await question('Author: ');

  const newBook = {
    userId: user.id,
    title,
    author,
    tiles: [],
    isFreebie: false,
    readAt: new Date(),
  };

  await db.createBook(newBook);
  console.log(`Added "${title}" for ${user.name}.`);
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function parseArgs(args) {
  const parsedArgs = {};
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
