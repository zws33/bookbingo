import z from 'zod/v4';
import { ChallengeRef } from '../challenges/schema.js';

/** Matches the `tags_label_check` bound, so a too-long label never reaches the insert. */
const TagLabel = z.string().trim().min(1).max(100);

const TagRef = ChallengeRef.extend({
  tagId: z.string().trim().min(1),
});

export const ListTagsRequestSchema = ChallengeRef;

export const CreateTagRequestSchema = ChallengeRef.extend({
  label: TagLabel,
});

export const UpdateTagRequestSchema = TagRef.extend({
  label: TagLabel,
});

export const DeleteTagRequestSchema = TagRef;
