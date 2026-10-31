import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../testing/test-utils';
import { AccountMenu } from './AccountMenu';
import type { AuthUser } from '../lib/auth';

const USER: AuthUser = {
  uid: 'u-1',
  displayName: 'Ada Lovelace',
  photoURL: null,
};

function renderMenu(user: AuthUser = USER) {
  const onFeedback = vi.fn();
  const onSignOut = vi.fn();
  render(
    <AccountMenu user={user} onFeedback={onFeedback} onSignOut={onSignOut} />,
  );
  return { user: userEvent.setup(), onFeedback, onSignOut };
}

async function openMenu(
  actor: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await actor.click(screen.getByRole('button', { name: `Account: ${name}` }));
  return screen.findByRole('menu');
}

describe('AccountMenu', () => {
  it('names the signed-in user on the trigger', () => {
    renderMenu();

    expect(
      screen.getByRole('button', { name: 'Account: Ada Lovelace' }),
    ).toBeInTheDocument();
  });

  it('falls back to a generic trigger name without a display name', () => {
    renderMenu({ ...USER, displayName: null });

    expect(
      screen.getByRole('button', { name: 'Account: Account' }),
    ).toBeInTheDocument();
  });

  it('opens feedback from the menu', async () => {
    const { user: actor, onFeedback, onSignOut } = renderMenu();
    await openMenu(actor, 'Ada Lovelace');

    await actor.click(screen.getByRole('menuitem', { name: 'Send Feedback' }));

    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it('signs out from the menu', async () => {
    const { user: actor, onFeedback, onSignOut } = renderMenu();
    await openMenu(actor, 'Ada Lovelace');

    await actor.click(screen.getByRole('menuitem', { name: 'Sign Out' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onFeedback).not.toHaveBeenCalled();
  });
});
