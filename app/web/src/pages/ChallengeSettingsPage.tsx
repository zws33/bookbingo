import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveChallenge } from '../challenge/ChallengeContext';
import {
  canChangeStatus,
  canEditConfig,
  canRename,
  nextStatus,
} from '../challenge/permissions';
import {
  deleteChallenge,
  setChallengeStatus,
  updateChallengeConfig,
} from '../data/challenges';
import { queryKeys } from '../lib/queryClient';
import { useToast } from '../lib/ToastContext';
import { AlertDialog } from '../components/ui/AlertDialog.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Label } from '../components/ui/Label.js';
import type { ChallengeStatus } from '../types/challenges';

const MAX_NAME_LENGTH = 100;

interface Transition {
  label: string;
  title: string;
  hint: string;
  message: string;
  success: string;
}

/**
 * Keyed by destination, so `nextStatus` stays the only place the chain is
 * written: a step the lifecycle does not offer has no copy and renders
 * nothing. Each step is one-way, so each is confirmed and each says what it
 * costs.
 */
const TRANSITIONS: Record<ChallengeStatus, Transition | undefined> = {
  // Nothing transitions into draft.
  draft: undefined,
  active: {
    label: 'Start challenge',
    title: 'Start this challenge?',
    hint: 'Nobody can log a book until the challenge starts.',
    message:
      'Books can be logged from then on, and the tags-per-book cap locks because scores depend on it. There is no going back to draft.',
    success: 'Challenge started.',
  },
  complete: {
    label: 'Finish challenge',
    title: 'Finish this challenge?',
    hint: 'Finishing freezes books, membership and settings.',
    message:
      'Books, membership and settings freeze, and scores become final. There is no reopening it.',
    success: 'Challenge finished.',
  },
};

export function ChallengeSettingsPage() {
  const { challenge, membership } = useActiveChallenge();
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const navigate = useNavigate();

  const [name, setName] = useState(challenge.name);
  const [tagCap, setTagCap] = useState(String(challenge.tagCap));
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingTransition, setIsConfirmingTransition] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const nameEditable = canRename(membership.role, challenge.status);
  const capEditable = canEditConfig(membership.role, challenge.status);
  const ownsLifecycle = canChangeStatus(membership.role);
  const target = nextStatus(challenge.status);
  const transition = target ? TRANSITIONS[target] : undefined;

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

  const handleTransition = async (to: ChallengeStatus, step: Transition) => {
    setIsConfirmingTransition(false);
    setIsTransitioning(true);
    try {
      await setChallengeStatus({ challengeId: challenge.id, status: to });
      showSuccess(step.success);
      // Not awaited: the toast is the confirmation, and the refetch behind
      // this invalidation would delay it by a round trip.
      void queryClient.invalidateQueries({ queryKey: queryKeys.myChallenges });
    } catch (transitionError) {
      showError(
        transitionError instanceof Error
          ? transitionError.message
          : 'Could not change the challenge status.',
      );
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleDelete = async () => {
    setIsConfirmingDelete(false);
    setIsDeleting(true);
    try {
      await deleteChallenge({ challengeId: challenge.id });
      // Awaited, unlike the transition's: the list this invalidates is where
      // the navigation lands, and from a stale cache it would still offer the
      // deleted challenge.
      await queryClient.invalidateQueries({ queryKey: queryKeys.myChallenges });
      navigate('/challenges', { replace: true });
    } catch (deleteError) {
      showError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete the challenge.',
      );
    } finally {
      setIsDeleting(false);
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

      {ownsLifecycle && (
        <>
          {transition && target && (
            <section className="mt-10 border-t border-outline-variant pt-6">
              <h3 className="font-medium text-on-surface">Lifecycle</h3>
              <p className="mt-1 text-sm text-on-surface-variant">
                {transition.hint}
              </p>
              <Button
                variant="outline"
                className="mt-3"
                loading={isTransitioning}
                onClick={() => setIsConfirmingTransition(true)}
              >
                {transition.label}
              </Button>
            </section>
          )}

          <section className="mt-10 border-t border-outline-variant pt-6">
            <h3 className="font-medium text-on-surface">Delete</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              A challenge that holds any book or reading-list entry cannot be
              deleted.
            </p>
            <Button
              variant="danger"
              className="mt-3"
              loading={isDeleting}
              onClick={() => setIsConfirmingDelete(true)}
            >
              Delete challenge
            </Button>
          </section>
        </>
      )}

      {transition && target && (
        <AlertDialog
          isOpen={isConfirmingTransition}
          onClose={() => setIsConfirmingTransition(false)}
          onConfirm={() => void handleTransition(target, transition)}
          title={transition.title}
          message={transition.message}
          confirmLabel={transition.label}
        />
      )}

      <AlertDialog
        isOpen={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        onConfirm={() => void handleDelete()}
        title={`Delete ${challenge.name}?`}
        message="The challenge, its members and its join code go away. This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}
