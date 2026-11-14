import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, type CallableOptions } from 'firebase-functions/v2/https';
import { bookHandlers } from './books/handler.js';
import { searchBooksHandler } from './books/searchHandler.js';
import { bookRepository } from './books/store.js';
import { callable } from './callable.js';
import { challengeHandlers } from './challenges/handler.js';
import { challengeRepository } from './challenges/store.js';
import { boardConfigHandlers } from './config/handler.js';
import { GITHUB_API_URL, submitFeedbackHandler } from './feedback/handler.js';
import { libraryHandlers } from './library/handler.js';
import { readingHandlers } from './readings/handler.js';
import { readingRepository } from './readings/store.js';
import { scoringHandlers } from './scoring/handler.js';
import { scoringConfigRepository } from './scoring/store.js';
import { tagHandlers } from './tags/handler.js';
import { tagRepository } from './tags/store.js';
import { tbrHandlers } from './tbr/handler.js';
import { tbrEntryRepository } from './tbr/store.js';
import { userHandlers } from './users/handler.js';
import { userProfileRepository } from './users/store.js';

// Caps the blast radius of a runaway caller rather than the traffic: nothing
// rate-limits these endpoints, and the platform default of 100 instances lets
// a loop fan out until it shows up on the bill. Raise it when real concurrency
// needs it, not before.
setGlobalOptions({ region: 'northamerica-northeast1', maxInstances: 10 });

const githubPat = defineSecret('GITHUB_PAT');
const databaseUrl = defineSecret('DATABASE_URL');

const dbBacked: CallableOptions = {
  invoker: 'public',
  secrets: [databaseUrl],
};

/**
 * Built on first request, not at module load: the pool reads DATABASE_URL,
 * which only exists in a process whose function declares the secret, and
 * `firebase deploy` loads this module to discover the exports with no secrets
 * bound. Constructing it here would fail every deploy of the codebase.
 */
function buildApi() {
  const challengesRepo = challengeRepository();
  const tagsRepo = tagRepository();
  const booksRepo = bookRepository();
  const readingsRepo = readingRepository();
  const tbrRepo = tbrEntryRepository();
  const usersRepo = userProfileRepository();
  const scoringConfigRepo = scoringConfigRepository();

  return {
    challenges: challengeHandlers(challengesRepo),
    tags: tagHandlers(tagsRepo, challengesRepo),
    boardConfig: boardConfigHandlers(tagsRepo, challengesRepo),
    readings: readingHandlers(
      readingsRepo,
      booksRepo,
      challengesRepo,
      tagsRepo,
      scoringConfigRepo,
    ),
    scoring: scoringHandlers(
      readingsRepo,
      challengesRepo,
      tagsRepo,
      scoringConfigRepo,
    ),
    library: libraryHandlers(readingsRepo, booksRepo, challengesRepo),
    tbr: tbrHandlers(tbrRepo, booksRepo, challengesRepo),
    books: bookHandlers(booksRepo),
    users: userHandlers(usersRepo),
  };
}

let apiInstance: ReturnType<typeof buildApi> | undefined;
function api() {
  return (apiInstance ??= buildApi());
}

export const submitFeedback = onCall(
  { invoker: 'public', secrets: [githubPat] },
  callable(
    (request) =>
      submitFeedbackHandler(request, {
        pat: githubPat.value(),
        apiUrl: GITHUB_API_URL,
      }),
    'Failed to create GitHub issue. Please try again.',
  ),
);

/** No `V2` twin: it reads the catalog provider and touches no store. */
export const searchBooks = onCall(
  { invoker: 'public' },
  callable(searchBooksHandler, 'Book search is unavailable.'),
);

export const createChallenge = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.create(request),
    'Failed to create the challenge.',
  ),
);
export const getMyChallenges = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.getMyChallenges(request),
    'Could not load your challenges.',
  ),
);
export const getChallenge = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.get(request),
    'Could not load that challenge.',
  ),
);
export const updateChallengeConfig = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.updateConfig(request),
    'Failed to save the challenge settings.',
  ),
);
export const joinChallenge = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.join(request),
    'Failed to join the challenge.',
  ),
);
export const leaveChallenge = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.leave(request),
    'Failed to leave the challenge.',
  ),
);
export const removeMember = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.removeMember(request),
    'Failed to remove that member.',
  ),
);
export const setMemberRole = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.setMemberRole(request),
    'Failed to change the member role.',
  ),
);
export const setChallengeStatus = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.setStatus(request),
    'Failed to change the challenge status.',
  ),
);
export const deleteChallenge = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.remove(request),
    'Failed to delete the challenge.',
  ),
);
export const rotateJoinCode = onCall(
  dbBacked,
  callable(
    (request) => api().challenges.rotateJoinCode(request),
    'Failed to rotate the join code.',
  ),
);

export const listTags = onCall(
  dbBacked,
  callable(
    (request) => api().tags.list(request),
    'Could not load the challenge tags.',
  ),
);
export const createTag = onCall(
  dbBacked,
  callable((request) => api().tags.create(request), 'Failed to add the tag.'),
);
export const updateTag = onCall(
  dbBacked,
  callable(
    (request) => api().tags.update(request),
    'Failed to rename the tag.',
  ),
);
export const deleteTag = onCall(
  dbBacked,
  callable(
    (request) => api().tags.remove(request),
    'Failed to delete the tag.',
  ),
);

export const getBoardConfigV2 = onCall(
  dbBacked,
  callable(
    (request) => api().boardConfig.get(request),
    'Failed to load board configuration.',
  ),
);

export const listReadingsV2 = onCall(
  dbBacked,
  callable(
    (request) => api().readings.list(request),
    'Failed to load readings.',
  ),
);
export const getLeaderboardV2 = onCall(
  dbBacked,
  callable(
    (request) => api().readings.leaderboard(request),
    'Failed to load leaderboard.',
  ),
);
export const createReadingV2 = onCall(
  dbBacked,
  callable(
    (request) => api().readings.create(request),
    'Failed to save your reading.',
  ),
);
export const updateReadingV2 = onCall(
  dbBacked,
  callable(
    (request) => api().readings.update(request),
    'Failed to update your reading.',
  ),
);
export const deleteReadingV2 = onCall(
  dbBacked,
  callable(
    (request) => api().readings.remove(request),
    'Failed to delete your reading.',
  ),
);

export const getScore = onCall(
  dbBacked,
  callable(
    (request) => api().scoring.get(request),
    'Could not load that score.',
  ),
);

export const getLibraryV2 = onCall(
  dbBacked,
  callable(
    (request) => api().library.get(request),
    'Failed to load the library.',
  ),
);

export const listMyTBRV2 = onCall(
  dbBacked,
  callable(
    (request) => api().tbr.list(request),
    'Failed to load your reading list.',
  ),
);
export const createTBREntryV2 = onCall(
  dbBacked,
  callable(
    (request) => api().tbr.create(request),
    'Failed to save your reading list.',
  ),
);
export const updateTBREntryV2 = onCall(
  dbBacked,
  callable(
    (request) => api().tbr.update(request),
    'Failed to save your reading list.',
  ),
);
export const deleteTBREntryV2 = onCall(
  dbBacked,
  callable(
    (request) => api().tbr.remove(request),
    'Failed to save your reading list.',
  ),
);
export const promoteTBREntryV2 = onCall(
  dbBacked,
  callable(
    (request) => api().tbr.promote(request),
    'Failed to save your reading.',
  ),
);

export const fetchBookDetailsV2 = onCall(
  dbBacked,
  callable(
    (request) => api().books.fetchDetails(request),
    'Could not load book details.',
  ),
);
export const createManualBookV2 = onCall(
  dbBacked,
  callable(
    (request) => api().books.createManual(request),
    'Failed to create book.',
  ),
);
export const listUsersV2 = onCall(
  dbBacked,
  callable((request) => api().users.list(request), 'Failed to load users.'),
);
export const getUserProfileV2 = onCall(
  dbBacked,
  callable((request) => api().users.get(request), 'Failed to load profile.'),
);
export const syncMyProfileV2 = onCall(
  dbBacked,
  callable((request) => api().users.sync(request), 'Failed to save profile.'),
);
