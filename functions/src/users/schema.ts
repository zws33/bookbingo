import z from 'zod/v4';

export const GetUserProfileRequestSchema = z.object({
  userId: z.string().trim().min(1),
});
