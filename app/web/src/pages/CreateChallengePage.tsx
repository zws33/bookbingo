import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createChallenge } from '../data/challenges';
import { queryKeys } from '../lib/queryClient';
import { useToast } from '../lib/ToastContext';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Label } from '../components/ui/Label.js';

const MAX_NAME_LENGTH = 100;

interface FieldErrors {
  nameError?: string;
  capError?: string;
}

type Validation =
  | { ok: true; name: string; tagCap: number }
  | ({ ok: false } & FieldErrors);

/** Mirrors `CreateChallengeRequestSchema`. The server rejects the same values. */
function validate(name: string, tagCap: string): Validation {
  const trimmed = name.trim();
  const cap = Number(tagCap);

  if (trimmed.length === 0) {
    return { ok: false, nameError: 'Give the challenge a name.' };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      nameError: `Keep the name under ${MAX_NAME_LENGTH} characters.`,
    };
  }
  if (!Number.isInteger(cap) || cap < 1) {
    return {
      ok: false,
      capError: 'The tag cap has to be a whole number of at least 1.',
    };
  }
  return { ok: true, name: trimmed, tagCap: cap };
}

export function CreateChallengePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showError } = useToast();
  const [name, setName] = useState('');
  const [tagCap, setTagCap] = useState('3');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const result = validate(name, tagCap);
    if (!result.ok) {
      setErrors(result);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      const { challengeId } = await createChallenge({
        name: result.name,
        tagCap: result.tagCap,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.myChallenges,
      });
      navigate(`/c/${challengeId}`, { replace: true });
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : 'Could not create the challenge.',
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md">
      <h2 className="font-display text-xl font-semibold text-on-surface mb-1">
        Create a challenge
      </h2>
      <p className="text-sm text-on-surface-variant mb-6">
        You start as its owner. It stays in draft — invisible to scores and
        closed to readings — until you start it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="challenge-name">Name</Label>
          <Input
            id="challenge-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="2026 Book Bingo"
            error={errors.nameError}
            className="mt-1"
            autoFocus
          />
          {errors.nameError && (
            <p className="mt-1 text-sm text-error">{errors.nameError}</p>
          )}
        </div>

        <div>
          <Label htmlFor="challenge-tag-cap">Tags per book</Label>
          <Input
            id="challenge-tag-cap"
            type="number"
            min={1}
            value={tagCap}
            onChange={(event) => setTagCap(event.target.value)}
            error={errors.capError}
            className="mt-1"
          />
          <p className="mt-1 text-sm text-on-surface-variant">
            Scores depend on this, so it locks once the challenge starts.
          </p>
          {errors.capError && (
            <p className="mt-1 text-sm text-error">{errors.capError}</p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" loading={isSubmitting}>
            Create
          </Button>
          <Link
            to="/challenges"
            className="text-sm text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
