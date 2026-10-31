import { Link } from 'react-router-dom';
import type { AuthUser } from '../lib/auth';
import { Avatar } from './ui/Avatar.js';
import { DropdownMenu } from './ui/DropdownMenu.js';

interface AccountMenuProps {
  user: AuthUser;
  onFeedback: () => void;
  onSignOut: () => void;
  className?: string;
}

/**
 * The narrow-screen form of the header's right-hand controls. Inline, they are
 * ~270px wide and leave nothing for the challenge switcher beside them.
 */
export function AccountMenu({
  user,
  onFeedback,
  onSignOut,
  className,
}: AccountMenuProps) {
  const name = user.displayName ?? 'Account';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={className}
        aria-label={`Account: ${name}`}
      >
        <Avatar name={name} photoURL={user.photoURL ?? undefined} />
      </DropdownMenu.Trigger>

      {/*
        Feedback opens a dialog. Without this, the menu's focus restore lands on
        the trigger after the dialog has mounted and takes focus out of it.
      */}
      <DropdownMenu.Content
        align="end"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {user.displayName && (
          <DropdownMenu.Label>{user.displayName}</DropdownMenu.Label>
        )}
        {import.meta.env.DEV && (
          <DropdownMenu.Item asChild>
            <Link to="/catalog">Catalog</Link>
          </DropdownMenu.Item>
        )}
        <DropdownMenu.Item onSelect={onFeedback}>
          Send Feedback
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={onSignOut}>Sign Out</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
