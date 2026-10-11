import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../testing/test-utils';
import { ReadingForm } from './ReadingForm';

vi.mock('../hooks/useTileCatalog', async () => ({
  useTileCatalog: (await import('../testing/fixtures')).tileCatalogStub,
}));

import { TILE } from '../testing/fixtures';

type ReadingFormProps = Parameters<typeof ReadingForm>[0];

function renderReadingForm(
  initialData: Partial<ReadingFormProps['initialData']> = {},
) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <ReadingForm
      initialData={{
        title: 'Dune',
        author: 'Frank Herbert',
        tiles: [],
        isFreebie: false,
        ...initialData,
      }}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={false}
    />,
  );
  return { user, onSubmit, onCancel };
}

const saveButton = () => screen.getByRole('button', { name: /save/i });

describe('ReadingForm', () => {
  it('submits the selected tiles and freebie flag', async () => {
    const { user, onSubmit } = renderReadingForm();

    await user.click(screen.getByRole('checkbox', { name: /freebie/i }));
    await user.click(screen.getByRole('button', { name: TILE.series.name }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith({
      tiles: [TILE.series.id],
      isFreebie: true,
    });
  });

  it('blocks Save on a freebie with no tiles', async () => {
    const { user, onSubmit } = renderReadingForm();

    await user.click(screen.getByRole('checkbox', { name: /freebie/i }));

    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByText('A freebie needs at least one tile.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks Save on a stored freebie whose tiles were cleared', async () => {
    const { user } = renderReadingForm({
      tiles: [TILE.series.id],
      isFreebie: true,
    });

    await user.click(screen.getByRole('button', { name: TILE.series.name }));

    expect(saveButton()).toBeDisabled();
  });

  it('leaves Save enabled on a non-freebie with no tiles', () => {
    renderReadingForm();

    expect(saveButton()).toBeEnabled();
  });
});
