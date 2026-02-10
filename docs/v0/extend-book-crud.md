# Extend Book CRUD: Tile Selection & Freebie Toggle

## Overview

Add tile assignment and freebie designation to the book add/edit flow. Users will be able to select up to 3 bingo tiles per book (or unlimited for a freebie book) when creating or editing a reading.

## Goal

When adding or editing a book, users can:

- Search and select tiles from the 43 book-assignable tiles
- Toggle "freebie" status (removes the 3-tile limit)
- See selected tiles displayed on book cards (already implemented in `BookCard.tsx`)

## Definition of Done

- `BookForm` includes a searchable tile selector and freebie toggle
- `createReading` and `updateReading` persist `tiles` and `isFreebie` to Firestore
- `App.tsx` and `BookList.tsx` pass tile/freebie data through the full add/edit flow
- All checks pass: `npm run lint && npm test && npm run typecheck`
- Manual testing confirms tiles and freebie status are saved and displayed correctly

## Important Context

**Existing code that already works (do NOT reimplement):**

- `BookCard.tsx` already renders tiles as blue chips when `reading.tiles` has entries
- `lib/core/constants.ts` defines all 49 tiles (43 book-assignable + 6 manual)
- `lib/core/validation.ts` exports `MAX_TILES_PER_BOOK = 3` and validation functions
- Vite aliases are configured: `@core` → `lib/core`, `@types` → `lib/types` (defined in `app/web/vite.config.ts` and `app/web/tsconfig.json`)

**Files that consume `BookFormData` (will need updates when the interface changes):**

- `app/web/src/App.tsx` — `handleAddBook` calls `createReading`
- `app/web/src/components/BookList.tsx` — `handleEdit` calls `updateReading`, passes `initialData` to `BookForm`

## Deferred Work

Single-freebie validation (ensuring only one book per user is marked as freebie) is **not** part of this task. It requires querying other readings and adds complexity. It will be handled in a separate follow-up task.

---

## Implementation Steps

This is a single commit: `feat: add tile selection and freebie toggle to book form`

Complete all steps in order, then run `npm run lint && npm test && npm run typecheck` before committing.

---

### Step 1: Create `app/web/src/components/TileSelector.tsx` (new file)

Create this file with the following exact content:

```typescript
import { useState, useMemo } from 'react';
import { TILES } from '@core/constants';
import { MAX_TILES_PER_BOOK } from '@core/validation';

interface TileSelectorProps {
  selectedTiles: string[];
  onChange: (tiles: string[]) => void;
  isFreebie: boolean;
}

const bookAssignableTiles = TILES.filter((t) => !t.isManual);

export function TileSelector({ selectedTiles, onChange, isFreebie }: TileSelectorProps) {
  const [search, setSearch] = useState('');

  const filteredTiles = useMemo(() => {
    if (!search.trim()) return bookAssignableTiles;
    const term = search.toLowerCase();
    return bookAssignableTiles.filter((t) => t.name.toLowerCase().includes(term));
  }, [search]);

  const atLimit = !isFreebie && selectedTiles.length >= MAX_TILES_PER_BOOK;

  const handleToggle = (tileId: string) => {
    if (selectedTiles.includes(tileId)) {
      onChange(selectedTiles.filter((id) => id !== tileId));
    } else {
      if (atLimit) return;
      onChange([...selectedTiles, tileId]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Tiles {isFreebie ? '(unlimited)' : `(up to ${MAX_TILES_PER_BOOK})`}
      </label>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tiles..."
        className="w-full px-3 py-2 mb-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
      />
      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {filteredTiles.map((tile) => {
          const isSelected = selectedTiles.includes(tile.id);
          const isDisabled = atLimit && !isSelected;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => handleToggle(tile.id)}
              disabled={isDisabled}
              className={`px-2 py-1.5 rounded text-sm text-left transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-50 text-gray-800 hover:bg-gray-100'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {tile.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

---

### Step 2: Create `app/web/src/components/FreebieToggle.tsx` (new file)

Create this file with the following exact content:

```typescript
interface FreebieToggleProps {
  isFreebie: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function FreebieToggle({ isFreebie, onChange, disabled }: FreebieToggleProps) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={isFreebie}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
      <span className="text-sm text-gray-900">Freebie (unlimited tiles)</span>
    </label>
  );
}
```

---

### Step 3: Update `app/web/src/components/BookForm.tsx`

This file needs three changes: update the `BookFormData` interface, add state for tiles/freebie, and render the new components.

**Change 1 — Update the `BookFormData` interface and imports.**

Replace:

```typescript
import { useState, FormEvent } from 'react';

export interface BookFormData {
  title: string;
  author: string;
}
```

With:

```typescript
import { useState, FormEvent } from 'react';
import { TileSelector } from './TileSelector';
import { FreebieToggle } from './FreebieToggle';

export interface BookFormData {
  title: string;
  author: string;
  tiles: string[];
  isFreebie: boolean;
}
```

**Change 2 — Add state for tiles and freebie.**

Replace:

```typescript
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [author, setAuthor] = useState(initialData?.author ?? '');
```

With:

```typescript
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [author, setAuthor] = useState(initialData?.author ?? '');
  const [tiles, setTiles] = useState<string[]>(initialData?.tiles ?? []);
  const [isFreebie, setIsFreebie] = useState(initialData?.isFreebie ?? false);
```

**Change 3 — Update the submit handler to include tiles and freebie.**

Replace:

```typescript
    onSubmit({ title: title.trim(), author: author.trim() });
```

With:

```typescript
    onSubmit({ title: title.trim(), author: author.trim(), tiles, isFreebie });
```

**Change 4 — Add TileSelector and FreebieToggle to the form JSX.**

Replace:

```typescript
      <div className="flex justify-end gap-3 pt-2">
```

With:

```typescript
      <FreebieToggle isFreebie={isFreebie} onChange={setIsFreebie} />

      <TileSelector selectedTiles={tiles} onChange={setTiles} isFreebie={isFreebie} />

      <div className="flex justify-end gap-3 pt-2">
```

---

### Step 4: Update `app/web/src/lib/books.ts`

**Change 1 — Update `createReading` to accept tiles and isFreebie.**

Replace:

```typescript
export async function createReading(
  userId: string,
  title: string,
  author: string
): Promise<string> {
  const docRef = await addDoc(collection(db, 'users', userId, 'readings'), {
    bookTitle: title,
    bookAuthor: author,
    tiles: [],
    isFreebie: false,
    readAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
```

With:

```typescript
export async function createReading(
  userId: string,
  title: string,
  author: string,
  tiles: string[],
  isFreebie: boolean
): Promise<string> {
  const docRef = await addDoc(collection(db, 'users', userId, 'readings'), {
    bookTitle: title,
    bookAuthor: author,
    tiles,
    isFreebie,
    readAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
```

**Change 2 — Update `updateReading` to accept tiles and isFreebie.**

Replace:

```typescript
export async function updateReading(
  userId: string,
  readingId: string,
  title: string,
  author: string
): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
    bookTitle: title,
    bookAuthor: author,
    updatedAt: serverTimestamp(),
  });
}
```

With:

```typescript
export async function updateReading(
  userId: string,
  readingId: string,
  title: string,
  author: string,
  tiles: string[],
  isFreebie: boolean
): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
    bookTitle: title,
    bookAuthor: author,
    tiles,
    isFreebie,
    updatedAt: serverTimestamp(),
  });
}
```

---

### Step 5: Update `app/web/src/App.tsx`

Update the `handleAddBook` function to pass tiles and freebie data.

Replace:

```typescript
      await createReading(user.uid, data.title, data.author);
```

With:

```typescript
      await createReading(user.uid, data.title, data.author, data.tiles, data.isFreebie);
```

---

### Step 6: Update `app/web/src/components/BookList.tsx`

**Change 1 — Update `handleEdit` to pass tiles and freebie data.**

Replace:

```typescript
      await updateReading(user.uid, selectedReading.id, data.title, data.author);
```

With:

```typescript
      await updateReading(user.uid, selectedReading.id, data.title, data.author, data.tiles, data.isFreebie);
```

**Change 2 — Pass existing tiles and freebie status to the edit form.**

Replace:

```typescript
              initialData={{
                title: selectedReading.bookTitle,
                author: selectedReading.bookAuthor,
              }}
```

With:

```typescript
              initialData={{
                title: selectedReading.bookTitle,
                author: selectedReading.bookAuthor,
                tiles: selectedReading.tiles ?? [],
                isFreebie: selectedReading.isFreebie ?? false,
              }}
```

---

### Step 7: Verify

Run:

```bash
npm run lint && npm test && npm run typecheck
```

All checks must pass before committing.

---

### Step 8: Commit

```bash
git add app/web/src/components/TileSelector.tsx app/web/src/components/FreebieToggle.tsx app/web/src/components/BookForm.tsx app/web/src/lib/books.ts app/web/src/App.tsx app/web/src/components/BookList.tsx
git commit -m "feat: add tile selection and freebie toggle to book form"
```

---

## Manual Testing Checklist

After committing, manually verify:

- [ ] Add a new book with 0 tiles — saves correctly
- [ ] Add a new book with 1, 2, and 3 tiles — saves correctly
- [ ] Tile selector disables unselected tiles when 3 are selected (non-freebie)
- [ ] Toggle freebie on — can select more than 3 tiles
- [ ] Toggle freebie off when more than 3 tiles are selected — tiles persist but selector shows limit
- [ ] Search filters the tile list correctly
- [ ] Edit an existing book — tiles and freebie status are pre-populated
- [ ] Edit tiles on an existing book — changes persist to Firestore
- [ ] Book cards display tile chips correctly after save
- [ ] Existing books without tiles still display and edit correctly
