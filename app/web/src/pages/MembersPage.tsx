import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveChallenge } from '../challenge/ChallengeContext';
import { formatJoinCode } from '../challenge/joinCode';
import {
  atLeast,
  canManageMembers,
  statusAllows,
} from '../challenge/permissions';
import {
  getChallenge,
  leaveChallenge,
  rotateJoinCode,
} from '../data/challenges';
import { queryKeys } from '../lib/queryClient';
import { useToast } from '../lib/ToastContext';
import { PageStatus } from '../components/PageStatus';
import { AlertDialog } from '../components/ui/AlertDialog.js';
import { Avatar } from '../components/ui/Avatar.js';
import { Button } from '../components/ui/Button.js';
import { RoleBadge } from '../components/ui/RoleBadge.js';

const JOINED = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function MembersPage() {
  const { challenge, membership } = useActiveChallenge();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();
  const [isRotating, setIsRotating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isConfirmingLeave, setIsConfirmingLeave] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.challenge(challenge.id),
    queryFn: () => getChallenge(challenge.id),
  });

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showSuccess('Join code copied.');
    } catch {
      showError('Could not copy the code. Select it and copy by hand.');
    }
  };

  const handleRotate = async () => {
    setIsRotating(true);
    try {
      await rotateJoinCode({ challengeId: challenge.id });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.challenge(challenge.id),
      });
      showSuccess('Join code replaced. The old one no longer works.');
    } catch (rotateError) {
      showError(
        rotateError instanceof Error
          ? rotateError.message
          : 'Could not replace the join code.',
      );
    } finally {
      setIsRotating(false);
    }
  };

  const handleLeave = async () => {
    setIsConfirmingLeave(false);
    setIsLeaving(true);
    try {
      await leaveChallenge({ challengeId: challenge.id });
      await queryClient.invalidateQueries({ queryKey: queryKeys.myChallenges });
      navigate('/challenges', { replace: true });
    } catch (leaveError) {
      showError(
        leaveError instanceof Error
          ? leaveError.message
          : 'Could not leave the challenge.',
      );
      setIsLeaving(false);
    }
  };

  if (isPending || error) {
    return <PageStatus loading={isPending} error={error ?? undefined} />;
  }

  const manageable = canManageMembers(membership.role, challenge.status);
  const invitable = statusAllows(challenge.status, 'join');
  const rotatable = invitable && atLeast(membership.role, 'admin');

  return (
    <div className="space-y-6">
      {invitable && (
        <div className="rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
          <p className="text-sm text-on-surface-variant">
            Anyone with this code can join.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="font-mono text-lg font-semibold tracking-wider text-on-surface">
              {formatJoinCode(data.joinCode)}
            </code>
            <Button
              variant="outline"
              className="text-sm"
              onClick={() => void handleCopy(data.joinCode)}
            >
              Copy
            </Button>
            {rotatable && (
              <Button
                variant="ghost"
                className="text-sm"
                loading={isRotating}
                onClick={() => void handleRotate()}
              >
                Replace
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-lg shadow overflow-hidden">
        <ul>
          {data.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant last:border-0"
            >
              <Avatar
                name={member.name}
                photoURL={member.photoURL ?? undefined}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-on-surface truncate">
                  {member.name}
                </p>
                <p className="text-xs text-on-surface-variant">
                  Joined {JOINED.format(member.joinedAt)}
                </p>
              </div>
              <RoleBadge role={member.role} />
            </li>
          ))}
        </ul>

        {manageable && (
          <p className="px-4 py-3 text-xs text-on-surface-variant border-t border-outline-variant">
            Role changes and removals land with the member callables.
          </p>
        )}
      </div>

      {statusAllows(challenge.status, 'memberManage') && (
        <div>
          <Button
            variant="outline"
            className="text-sm"
            loading={isLeaving}
            onClick={() => setIsConfirmingLeave(true)}
          >
            Leave challenge
          </Button>
          <p className="mt-2 text-xs text-on-surface-variant">
            Your books stay on record but stop counting toward the leaderboard.
          </p>
        </div>
      )}

      <AlertDialog
        isOpen={isConfirmingLeave}
        onClose={() => setIsConfirmingLeave(false)}
        onConfirm={() => void handleLeave()}
        title={`Leave ${challenge.name}?`}
        message="You will need the join code to come back. Your books stay on record and stop counting toward the leaderboard."
        confirmLabel="Leave"
      />
    </div>
  );
}
