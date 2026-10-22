import { useQuery } from '@tanstack/react-query';
import { useActiveChallenge } from '../challenge/ChallengeContext';
import { canManageMembers } from '../challenge/permissions';
import { getChallenge } from '../data/challenges';
import { queryKeys } from '../lib/queryClient';
import { PageStatus } from '../components/PageStatus';
import { Avatar } from '../components/ui/Avatar.js';
import { RoleBadge } from '../components/ui/RoleBadge.js';

const JOINED = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function MembersPage() {
  const { challenge, membership } = useActiveChallenge();
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.challenge(challenge.id),
    queryFn: () => getChallenge(challenge.id),
  });

  if (isPending || error) {
    return <PageStatus loading={isPending} error={error ?? undefined} />;
  }

  const manageable = canManageMembers(membership.role, challenge.status);

  return (
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
  );
}
