import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TILES, MAX_TILES_PER_BOOK } from '@bookbingo/lib-core';
import { render } from '../testing/test-utils';
import { TileSelector } from './TileSelector';

// TileSelector is presentational: it renders framework-agnostic lib/core TILES
// and reports selection changes through onChange. No Firebase, no hooks of its
// own beyond local search state — so this file needs ZERO mocks. See
// CONVENTIONS.md; BookForm.test.tsx is the reference example.

type TileSelectorProps = Parameters<typeof TileSelector>[0];

// Tile display names come from lib/core TILES; the component emits their ids.
const TILE = {
  reread: { id: 't01', name: 'unfinished reread' },
  series: { id: 't02', name: 'part of a series' },
  long: { id: 't03', name: '1000+ pages' },
  short: { id: 't04', name: 'under 100 pages' },
} as const;

const tileButton = (name: string) => screen.getByRole('button', { name });

// Uncontrolled: selectedTiles stays fixed, onChange is a spy. Use this to assert
// the exact payload crossing the component boundary and static render state.
function renderTileSelector(overrides: Partial<TileSelectorProps> = {}) {
  const onChange = vi.fn();
  const props: TileSelectorProps = {
    selectedTiles: [],
    onChange,
    isFreebie: false,
    ...overrides,
  };
  const user = userEvent.setup();
  render(<TileSelector {...props} />);
  return { user, onChange };
}

// Controlled: a real parent that owns selectedTiles, mirroring how BookForm uses
// TileSelector. Use this to assert the UI *updates* after interaction — the
// regression surface for the stale-memo fix.
function renderControlledTileSelector(
  overrides: { initialSelected?: string[]; isFreebie?: boolean } = {},
) {
  const { initialSelected = [], isFreebie = false } = overrides;
  function Harness() {
    const [selected, setSelected] = useState(initialSelected);
    return (
      <TileSelector
        selectedTiles={selected}
        onChange={setSelected}
        isFreebie={isFreebie}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  return { user };
}

describe('TileSelector', () => {
  describe('rendering and selection state', () => {
    it('renders every assignable tile as a toggle button', () => {
      renderTileSelector();

      expect(screen.getAllByRole('button')).toHaveLength(TILES.length);
      expect(tileButton(TILE.reread.name)).toBeInTheDocument();
      expect(tileButton(TILE.series.name)).toBeInTheDocument();
    });

    it('marks pre-selected tiles as pressed and others as not pressed', () => {
      renderTileSelector({ selectedTiles: [TILE.series.id] });

      expect(
        screen.getByRole('button', { name: TILE.series.name, pressed: true }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: TILE.reread.name, pressed: false }),
      ).toBeInTheDocument();
    });
  });

  describe('toggling', () => {
    it('adds a tile to the selection when an unselected tile is clicked', async () => {
      const { user, onChange } = renderTileSelector({ selectedTiles: [] });

      await user.click(tileButton(TILE.series.name));

      expect(onChange).toHaveBeenCalledWith([TILE.series.id]);
    });

    it('removes a tile from the selection when a selected tile is clicked', async () => {
      const { user, onChange } = renderTileSelector({
        selectedTiles: [TILE.series.id],
      });

      await user.click(tileButton(TILE.series.name));

      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('appends to the existing selection without dropping prior tiles', async () => {
      const { user, onChange } = renderTileSelector({
        selectedTiles: [TILE.reread.id],
      });

      await user.click(tileButton(TILE.series.name));

      expect(onChange).toHaveBeenCalledWith([TILE.reread.id, TILE.series.id]);
    });
  });

  describe('search', () => {
    it('filters the tile buttons to those whose name matches the term', async () => {
      const { user } = renderTileSelector();

      await user.type(screen.getByRole('textbox'), 'reread');

      expect(tileButton(TILE.reread.name)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: TILE.series.name }),
      ).not.toBeInTheDocument();
    });
  });

  describe('the three-tile limit (non-freebie)', () => {
    const atLimit = {
      selectedTiles: [TILE.reread.id, TILE.series.id, TILE.long.id],
    };

    it('shows the remaining allowance in the label', () => {
      renderTileSelector();

      expect(
        screen.getByText(`Tiles (up to ${MAX_TILES_PER_BOOK})`),
      ).toBeInTheDocument();
    });

    it('disables an unselected tile once three are selected', () => {
      renderTileSelector(atLimit);

      expect(tileButton(TILE.short.name)).toBeDisabled();
    });

    it('keeps already-selected tiles enabled at the limit so they can be deselected', () => {
      renderTileSelector(atLimit);

      expect(tileButton(TILE.reread.name)).toBeEnabled();
    });
  });

  describe('freebie mode', () => {
    it('labels the selection as unlimited', () => {
      renderTileSelector({ isFreebie: true });

      expect(screen.getByText(/unlimited/i)).toBeInTheDocument();
    });

    it('keeps every tile enabled beyond three selections', () => {
      renderTileSelector({
        isFreebie: true,
        selectedTiles: [TILE.reread.id, TILE.series.id, TILE.long.id],
      });

      expect(tileButton(TILE.short.name)).toBeEnabled();
    });
  });

  // These exercise the fix directly: the derived isSelected/isDisabled/order live
  // in a useMemo keyed on [search, selectedTiles, atLimit]. With the prior
  // [search]-only deps, none of these updated after a click.
  describe('selection updates through interaction (stale-memo regression)', () => {
    it('shows a tile as pressed after it is clicked', async () => {
      const { user } = renderControlledTileSelector();

      await user.click(tileButton(TILE.series.name));

      expect(
        screen.getByRole('button', { name: TILE.series.name, pressed: true }),
      ).toBeInTheDocument();
    });

    it('disables the remaining tiles once the limit is reached by clicking', async () => {
      const { user } = renderControlledTileSelector();

      await user.click(tileButton(TILE.reread.name));
      await user.click(tileButton(TILE.series.name));
      await user.click(tileButton(TILE.long.name));

      expect(tileButton(TILE.short.name)).toBeDisabled();
    });

    it('moves a newly selected tile ahead of the unselected ones', async () => {
      const { user } = renderControlledTileSelector();

      // TILE.short sits fourth in TILES order; selecting it should float it up.
      await user.click(tileButton(TILE.short.name));

      expect(screen.getAllByRole('button')[0]).toHaveAccessibleName(
        TILE.short.name,
      );
    });
  });
});
