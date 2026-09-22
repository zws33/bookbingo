import z from 'zod/v4';

export const GetUserProfileRequestSchema = z.object({
  userId: z.string().trim().min(1),
});

export const UserProfileDocSchema = z.object({
  // .default() alone only fires on a missing/undefined key; .catch() on top
  // also replaces a stored `null`.
  name: z.string().default('User').catch('User'),
  photoURL: z.string().nullish(),
});
