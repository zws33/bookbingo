import { useState, type SubmitEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveChallenge } from '../challenge/ChallengeContext';
import { canEditConfig, canRename } from '../challenge/permissions';
import { updateChallengeConfig } from '../data/challenges';
import { queryKeys } from '../lib/queryClient';
import { useToast } from '../lib/ToastContext';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Label } from '../components/ui/Label.js';

const MAX_NAME_LENGTH = 100;

export function ChallengeSettingsPage() {
  const { challenge, membership } = useActiveChallenge();
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState(challenge.name);
  const [tagCap, setTagCap] = useState(String(challenge.tagCap));
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameEditable = canRename(membership.role, challenge.status);
  const capEditable = canEditConfig(membership.role, challenge.status);

  const nameChanged = nameEditable && name.trim() !== challenge.name;
  const capChanged = capEditable && Number(tagCap) !== challenge.tagCap;

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const cap = Number(tagCap);

    if (
      nameChanged &&
      (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH)
    ) {
      setError(`A name is 1 to ${MAX_NAME_LENGTH} characters.`);
      return;
    }
    if (capChanged && (!Number.isInteger(cap) || cap < 1)) {
      setError('The tag cap has to be a whole number of at least 1.');
      return;
    }

    setError(undefined);
    setIsSubmitting(true);
    try {
      await updateChallengeConfig({
        challengeId: challenge.id,
        ...(nameChanged ? { name: trimmed } : {}),
        ...(capChanged ? { tagCap: cap } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.myChallenges });
      showSuccess('Challenge updated.');
    } catch (updateError) {
      showError(
        updateError instanceof Error
          ? updateError.message
          : 'Could not save those changes.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md">
      <h2 className="font-display text-xl font-semibold text-on-surface mb-6">
        Challenge settings
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="settings-name">Name</Label>
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!nameEditable}
            className="mt-1"
          />
          {!nameEditable && (
            <p className="mt-1 text-sm text-on-surface-variant">
              A finished challenge cannot be renamed.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="settings-tag-cap">Tags per book</Label>
          <Input
            id="settings-tag-cap"
            type="number"
            min={1}
            value={tagCap}
            onChange={(event) => setTagCap(event.target.value)}
            disabled={!capEditable}
            className="mt-1"
          />
          {!capEditable && (
            <p className="mt-1 text-sm text-on-surface-variant">
              Scores already depend on the cap, so it is locked once the
              challenge starts.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <Button
          type="submit"
          loading={isSubmitting}
          disabled={!nameChanged && !capChanged}
        >
          Save changes
        </Button>
      </form>
    </div>
  );
}
