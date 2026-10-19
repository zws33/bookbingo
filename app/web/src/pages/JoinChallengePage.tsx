import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  JOIN_CODE_LENGTH,
  JOIN_CODE_PATTERN,
  normalizeJoinCode,
} from '../challenge/joinCode';
import { joinChallenge } from '../data/challenges';
import { queryKeys } from '../lib/queryClient';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Label } from '../components/ui/Label.js';

export function JoinChallengePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (!JOIN_CODE_PATTERN.test(normalized)) {
      setError(`A join code is ${JOIN_CODE_LENGTH} letters and numbers.`);
      return;
    }

    setError(undefined);
    setIsSubmitting(true);
    try {
      const { challengeId } = await joinChallenge(normalized);
      await queryClient.invalidateQueries({ queryKey: queryKeys.myChallenges });
      navigate(`/c/${challengeId}`, { replace: true });
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : 'Could not join that challenge.',
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md">
      <h2 className="font-display text-xl font-semibold text-on-surface mb-1">
        Join a challenge
      </h2>
      <p className="text-sm text-on-surface-variant mb-6">
        Ask an organizer for the code. Spaces and dashes are ignored.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="join-code">Join code</Label>
          <Input
            id="join-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="BNG0 2026"
            error={error}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-1 font-mono tracking-[0.3em] uppercase"
            autoFocus
          />
          {error && <p className="mt-1 text-sm text-error">{error}</p>}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" loading={isSubmitting}>
            Join
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
