import { useState } from 'react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Label } from '../components/ui/Label.js';
import { Textarea } from '../components/ui/Textarea.js';
import { TileBadge } from '../components/ui/TileBadge.js';
import { Avatar } from '../components/ui/Avatar.js';
import { ToggleGroup } from '../components/ui/ToggleGroup.js';
import { Accordion } from '../components/ui/Accordion.js';
import { Dialog } from '../components/ui/Dialog.js';
import { AlertDialog } from '../components/ui/AlertDialog.js';
import { Spinner } from '../components/ui/Spinner.js';
import { Tooltip } from '../components/ui/Tooltip.js';
import { useToast } from '../lib/ToastContext.js';

const NAV = [
  { id: 'colors', label: 'Colors' },
  { id: 'typography', label: 'Typography' },
  { id: 'shape', label: 'Shape & Shadow' },
  { id: 'button', label: 'Button' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'badges', label: 'Badges' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'spinner', label: 'Spinner' },
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'controls', label: 'Controls' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'toast', label: 'Toast' },
  { id: 'notes', label: 'Notes' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 mb-16">
      <h2 className="text-lg font-semibold text-gray-900 mb-5 pb-2 border-b border-gray-200">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RowLabel({ label, note }: { label: string; note?: string }) {
  return (
    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
      {label}
      {note && <span className="ml-2 normal-case font-normal">— {note}</span>}
    </div>
  );
}

function Swatch({ bg, label, darkText }: { bg: string; label: string; darkText?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-12 h-12 rounded-lg border border-black/10 ${bg}`} />
      <span
        className={`text-xs font-mono text-center leading-tight max-w-[60px] ${darkText ? 'text-gray-900' : 'text-gray-500'}`}
      >
        {label}
      </span>
    </div>
  );
}

function TypeRow({
  className,
  label,
  sample = 'Book Bingo',
}: {
  className: string;
  label: string;
  sample?: string;
}) {
  return (
    <div className="flex items-baseline gap-4 mb-3">
      <div className="w-52 text-xs text-gray-400 font-mono shrink-0">{label}</div>
      <div className={className}>{sample}</div>
    </div>
  );
}

function ShapeBox({
  radiusClass,
  shadowClass = '',
  label,
}: {
  radiusClass: string;
  shadowClass?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`w-16 h-16 bg-white border border-gray-200 ${radiusClass} ${shadowClass}`} />
      <span className="text-xs text-gray-500 font-mono text-center max-w-[80px] leading-tight">{label}</span>
    </div>
  );
}

function NoteCallout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 border-l-4 border-gray-300 rounded-r-lg p-4 mb-4">
      <div className="font-medium text-gray-700 text-sm mb-1">{title}</div>
      <div className="text-sm text-gray-600">{children}</div>
    </div>
  );
}

function MonoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 font-mono space-y-1">
      {children}
    </div>
  );
}

export function CatalogPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [toggleValue, setToggleValue] = useState('cards');
  const [loadingDemo, setLoadingDemo] = useState(false);
  const { showSuccess, showError } = useToast();

  const handleLoadingDemo = () => {
    setLoadingDemo(true);
    setTimeout(() => setLoadingDemo(false), 2000);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">UI Catalog</h1>
        <p className="text-sm text-gray-500 mt-1">
          Component inventory, design tokens, and design notes — dev only
        </p>
      </div>

      {/* Jump nav */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 -mx-4 px-4 mb-10 shadow-sm">
        <nav className="flex gap-1 overflow-x-auto py-2" aria-label="Catalog sections">
          {NAV.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 text-xs font-medium text-gray-500 hover:text-blue-600 px-2 py-1 rounded transition-colors whitespace-nowrap"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* ── COLORS ── */}
      <Section id="colors" title="Color Palette">
        <div className="mb-5">
          <RowLabel label="Brand" note="blue — actions, active states, focus rings, score values" />
          <div className="flex flex-wrap gap-3">
            <Swatch bg="bg-blue-50" label="blue-50" darkText />
            <Swatch bg="bg-blue-100" label="blue-100" darkText />
            <Swatch bg="bg-blue-200" label="blue-200" darkText />
            <Swatch bg="bg-blue-300" label="blue-300 border" darkText />
            <Swatch bg="bg-blue-600" label="blue-600 action" />
            <Swatch bg="bg-blue-700" label="blue-700 hover" />
            <Swatch bg="bg-blue-800" label="blue-800 text" />
            <Swatch bg="bg-blue-900" label="blue-900 label" />
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Neutral" note="gray — surfaces, text, borders, icons" />
          <div className="flex flex-wrap gap-3">
            <Swatch bg="bg-white border border-gray-200" label="white" darkText />
            <Swatch bg="bg-gray-50" label="gray-50 page" darkText />
            <Swatch bg="bg-gray-100" label="gray-100" darkText />
            <Swatch bg="bg-gray-200" label="gray-200" darkText />
            <Swatch bg="bg-gray-300" label="gray-300 border" darkText />
            <Swatch bg="bg-gray-400" label="gray-400 icon" />
            <Swatch bg="bg-gray-500" label="gray-500 muted" />
            <Swatch bg="bg-gray-600" label="gray-600 sub" />
            <Swatch bg="bg-gray-700" label="gray-700 body" />
            <Swatch bg="bg-gray-800" label="gray-800" />
            <Swatch bg="bg-gray-900" label="gray-900 title" />
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Status" note="feedback, warnings, special states" />
          <div className="flex flex-wrap gap-3">
            <Swatch bg="bg-green-500" label="green-500 success" />
            <Swatch bg="bg-red-500" label="red-500 error toast" />
            <Swatch bg="bg-red-600" label="red-600 danger btn" />
            <Swatch bg="bg-yellow-500" label="yellow-500 freebie" />
            <Swatch bg="bg-amber-400" label="amber-400 staging" darkText />
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Board cell fill" note="depth by book count per tile" />
          <div className="flex flex-wrap gap-3">
            <Swatch bg="bg-white border border-gray-200" label="0 books" darkText />
            <Swatch bg="bg-blue-50" label="1 book" darkText />
            <Swatch bg="bg-blue-100" label="2 books" darkText />
            <Swatch bg="bg-blue-200" label="3+ books" darkText />
          </div>
        </div>
      </Section>

      {/* ── TYPOGRAPHY ── */}
      <Section id="typography" title="Typography">
        <TypeRow className="text-3xl font-bold text-gray-900" label="3xl / bold / gray-900" sample="Welcome to Book Bingo" />
        <TypeRow className="text-3xl font-bold text-blue-600" label="3xl / bold / blue-600" sample="1,248 pts" />
        <TypeRow className="text-xl font-bold text-gray-900" label="xl / bold / gray-900" sample="📚 Book Bingo" />
        <TypeRow className="text-xl font-semibold text-gray-900" label="xl / semibold / gray-900" sample="42 books read" />
        <TypeRow className="text-lg font-semibold text-gray-900" label="lg / semibold / gray-900" sample="Edit Book · Dialog title" />
        <TypeRow className="text-lg font-medium text-gray-900" label="lg / medium / gray-900" sample="Sub-heading" />
        <TypeRow className="text-sm font-medium text-gray-700" label="sm / medium / gray-700" sample="Book title (Label)" />
        <TypeRow className="text-sm text-gray-900" label="sm / gray-900" sample="Body text, table cells" />
        <TypeRow className="text-sm text-gray-600" label="sm / gray-600" sample="Secondary body, descriptions" />
        <TypeRow className="text-sm text-gray-500" label="sm / gray-500" sample="Placeholder, muted" />
        <TypeRow className="text-xs text-gray-500" label="xs / gray-500" sample="Meta text, timestamps" />
        <TypeRow className="text-xs font-medium uppercase tracking-wide text-gray-400" label="xs / uppercase / tracking-wide" sample="TABLE HEADER" />
        <TypeRow className="text-sm font-medium text-blue-900 uppercase tracking-wider" label="sm / blue-900 / tracking-wider" sample="SCORE LABEL" />
        <div className="flex items-center gap-6 mt-3 border-t border-gray-100 pt-4">
          <div className="w-52 text-xs text-gray-400 font-mono">nav active / inactive</div>
          <div className="flex gap-4 border-b border-gray-200 pb-0">
            <span className="pb-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600">My Books</span>
            <span className="pb-2 text-sm font-medium text-gray-500">Bingo Board</span>
            <span className="pb-2 text-sm font-medium text-gray-500">Leaderboard</span>
          </div>
        </div>
      </Section>

      {/* ── SHAPE & SHADOW ── */}
      <Section id="shape" title="Shape & Shadow">
        <div className="mb-6">
          <RowLabel label="Border radius" note="rounded-lg is the canonical card/control radius" />
          <div className="flex flex-wrap gap-5">
            <ShapeBox radiusClass="rounded" label="rounded TileBadge, chips" />
            <ShapeBox radiusClass="rounded-lg" label="rounded-lg ✓ canonical" />
            <ShapeBox radiusClass="rounded-full" label="rounded-full Avatar, FAB, dots" />
          </div>
        </div>

        <div className="mb-6">
          <RowLabel label="Shadows" />
          <div className="flex flex-wrap gap-5">
            <ShapeBox radiusClass="rounded-lg" shadowClass="shadow-sm" label="shadow-sm ScoreDisplay" />
            <ShapeBox radiusClass="rounded-lg" shadowClass="shadow" label="shadow BookCard, lists" />
            <ShapeBox radiusClass="rounded-lg" shadowClass="shadow-lg" label="shadow-lg Toast" />
            <ShapeBox radiusClass="rounded-lg" shadowClass="shadow-xl" label="shadow-xl Dialog / AlertDialog" />
            <ShapeBox radiusClass="rounded-lg" shadowClass="shadow-inner" label="shadow-inner BingoBoard" />
          </div>
        </div>

        <div>
          <RowLabel label="Neutral borders" note="cards, inputs, dividers" />
          <div className="flex flex-wrap gap-5">
            <ShapeBox radiusClass="rounded-lg" shadowClass="border border-gray-100" label="gray-100 Accordion rows" />
            <ShapeBox radiusClass="rounded-lg" shadowClass="border border-gray-200" label="gray-200 cards, dividers" />
            <ShapeBox radiusClass="rounded-lg" shadowClass="border border-gray-300" label="gray-300 Input, buttons" />
          </div>
        </div>
      </Section>

      {/* ── BUTTON ── */}
      <Section id="button" title="Button">
        <div className="mb-5">
          <RowLabel label="Variants" note="base: inline-flex items-center gap-2 px-4 py-2 rounded-lg" />
          <div className="flex flex-wrap gap-6">
            {(
              [
                { variant: 'primary', desc: 'bg-blue-600 text-white' },
                { variant: 'secondary', desc: 'bg-gray-100 text-gray-800' },
                { variant: 'outline', desc: 'border border-gray-300 text-gray-700' },
                { variant: 'ghost', desc: 'text-gray-700 (no bg/border)' },
                { variant: 'danger', desc: 'bg-red-600 text-white' },
              ] as const
            ).map(({ variant, desc }) => (
              <div key={variant} className="flex flex-col items-center gap-1">
                <Button variant={variant}>{variant.charAt(0).toUpperCase() + variant.slice(1)}</Button>
                <span className="text-xs text-gray-400 font-mono">{variant}</span>
                <span className="text-xs text-gray-300 font-mono max-w-[120px] text-center leading-tight">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Disabled state" note="opacity-50 cursor-not-allowed" />
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" disabled>Primary</Button>
            <Button variant="secondary" disabled>Secondary</Button>
            <Button variant="outline" disabled>Outline</Button>
            <Button variant="ghost" disabled>Ghost</Button>
            <Button variant="danger" disabled>Danger</Button>
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Loading prop" note="auto-disables, shows Spinner + text; click to demo (2 s)" />
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" loading={loadingDemo} onClick={handleLoadingDemo}>
              Save Book
            </Button>
            <Button variant="secondary" loading={loadingDemo}>
              Searching…
            </Button>
          </div>
        </div>
      </Section>

      {/* ── INPUTS ── */}
      <Section id="inputs" title="Input & Textarea">
        <div className="mb-5">
          <RowLabel label="Label + Input" />
          <div className="flex flex-wrap gap-6">
            <div className="w-56">
              <Label className="mb-1">Book title</Label>
              <Input placeholder="e.g. The Overstory" />
            </div>
            <div className="w-56">
              <Label className="mb-1">Disabled</Label>
              <Input placeholder="Cannot edit" disabled />
            </div>
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Error state" note="error prop — applies red border/ring + aria-invalid" />
          <div className="w-56">
            <Label className="mb-1">Title</Label>
            <Input error="Title is required" placeholder="e.g. The Overstory" />
            <p className="mt-1 text-xs text-red-500">Title is required</p>
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="With icon prefix" note="pl-10 className override (SearchFilter pattern)" />
          <div className="relative w-56">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <Input placeholder="Search books…" className="pl-10" />
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Textarea" />
          <div className="flex flex-wrap gap-6">
            <div className="w-56">
              <Label className="mb-1">Notes</Label>
              <Textarea placeholder="What did you think?" rows={3} />
            </div>
            <div className="w-56">
              <Label className="mb-1">With error</Label>
              <Textarea error="Description is required" placeholder="Cannot be empty" rows={3} />
              <p className="mt-1 text-xs text-red-500">Description is required</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── BADGES ── */}
      <Section id="badges" title="Badges & Indicators">
        <div className="mb-5">
          <RowLabel label="TileBadge / primary" note="bg-blue-100 text-blue-800 rounded py-0.5" />
          <div className="flex flex-wrap gap-2">
            <TileBadge tileId="t01" variant="primary" />
            <TileBadge tileId="t04" variant="primary" />
            <TileBadge tileId="t11" variant="primary" />
            <TileBadge tileId="t18" variant="primary" />
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="TileBadge / secondary" note="bg-gray-100 text-gray-600 rounded py-0.5 — slightly less horizontal padding" />
          <div className="flex flex-wrap gap-2">
            <TileBadge tileId="t01" variant="secondary" />
            <TileBadge tileId="t04" variant="secondary" />
            <TileBadge tileId="t11" variant="secondary" />
            <TileBadge tileId="t18" variant="secondary" />
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Freebie star" note="text-yellow-500 — only yellow usage in the codebase (BookRow)" />
          <div className="flex items-center gap-2">
            <span className="text-yellow-500">★</span>
            <span className="text-sm text-gray-700">Freebie</span>
          </div>
        </div>

        <div className="mb-5">
          <RowLabel label="Metadata category chips" note="BookList read-only dialog — raw text labels (not tile IDs), same shape as TileBadge secondary" />
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Fiction</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Science Fiction</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Literary Fiction</span>
          </div>
        </div>
      </Section>

      {/* ── AVATAR ── */}
      <Section id="avatar" title="Avatar">
        <div className="mb-3">
          <RowLabel label="Sizes × states" note="initials fallback when no photoURL provided" />
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col items-center gap-2">
              <Avatar name="Zach Smith" size="sm" />
              <span className="text-xs text-gray-400 font-mono">sm / initials</span>
              <span className="text-xs text-gray-300 font-mono">w-6 h-6 text-xs</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Avatar name="Zach Smith" size="md" />
              <span className="text-xs text-gray-400 font-mono">md / initials</span>
              <span className="text-xs text-gray-300 font-mono">w-8 h-8 text-sm</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Avatar name="Alexandra Pemberton" size="sm" />
              <span className="text-xs text-gray-400 font-mono">sm / long name</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Avatar name="Alexandra Pemberton" size="md" />
              <span className="text-xs text-gray-400 font-mono">md / long name</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Note: the profile photo in the App header is a raw{' '}
          <code className="bg-gray-100 px-1 rounded">&lt;img&gt;</code>. Photo variant of Avatar renders identically — an{' '}
          <code className="bg-gray-100 px-1 rounded">&lt;img object-cover&gt;</code> in place of the initials span.
        </p>
      </Section>

      {/* ── SPINNER ── */}
      <Section id="spinner" title="Spinner">
        <div className="mb-5">
          <RowLabel label="Sizes" note="animate-spin, currentColor — inherits text color from parent" />
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <Spinner className="w-3 h-3 text-blue-600" />
              <span className="text-xs text-gray-400 font-mono">w-3 h-3</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Spinner className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-gray-400 font-mono">w-4 h-4 (Button default)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Spinner className="w-5 h-5 text-blue-600" />
              <span className="text-xs text-gray-400 font-mono">w-5 h-5</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Spinner className="w-8 h-8 text-gray-400" />
              <span className="text-xs text-gray-400 font-mono">w-8 h-8 page-level</span>
            </div>
          </div>
        </div>
        <MonoNote>
          <div>aria-hidden="true" — purely decorative; pair with visible text or screen-reader-only label</div>
          <div>currentColor means text-* class controls the fill — matches white on primary/danger, gray on secondary</div>
        </MonoNote>
      </Section>

      {/* ── TOOLTIP ── */}
      <Section id="tooltip" title="Tooltip">
        <div className="mb-5">
          <RowLabel label="Radix Tooltip" note="Portal-rendered, keyboard-accessible, auto-repositions at viewport edges" />
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex flex-col items-center gap-2">
              <Tooltip content="1 point for each unique category covered. Spread your reading for more points.">
                <button
                  type="button"
                  className="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:text-gray-500"
                  aria-label="About variety points"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </Tooltip>
              <span className="text-xs text-gray-400">hover / focus me (side=top)</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <Tooltip content="Bonus for repeat books in a category, with diminishing returns." side="right">
                <Button variant="secondary" className="text-sm">
                  Hover for tooltip (right)
                </Button>
              </Tooltip>
              <span className="text-xs text-gray-400">side=right</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <Tooltip content="Short tip." side="bottom">
                <span className="text-xs text-gray-500 underline decoration-dotted cursor-help">
                  inline text trigger
                </span>
              </Tooltip>
              <span className="text-xs text-gray-400">side=bottom, inline trigger</span>
            </div>
          </div>
        </div>
        <MonoNote>
          <div>Provider delayDuration=200ms · sideOffset=6px · max-w-[12rem]</div>
          <div>Renders in Portal at body level — z-50, unaffected by local stacking contexts</div>
          <div>RadixTooltip.Arrow adds a filled triangle matching bg-gray-900</div>
        </MonoNote>
      </Section>

      {/* ── CONTROLS ── */}
      <Section id="controls" title="Controls: ToggleGroup & Accordion">
        <div className="mb-8">
          <RowLabel label="ToggleGroup" note="single-select, icon toggles — used in BookList for cards/list view" />
          <div className="flex items-center gap-4">
            <ToggleGroup.Root
              type="single"
              value={toggleValue}
              onValueChange={(v) => v && setToggleValue(v)}
            >
              <ToggleGroup.Item value="cards" aria-label="Cards view">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="1" />
                  <rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
              </ToggleGroup.Item>
              <ToggleGroup.Item value="list" aria-label="List view">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <line x1="3" y1="4" x2="13" y2="4" />
                  <line x1="3" y1="8" x2="13" y2="8" />
                  <line x1="3" y1="12" x2="13" y2="12" />
                </svg>
              </ToggleGroup.Item>
            </ToggleGroup.Root>
            <span className="text-xs text-gray-400 font-mono">active: {toggleValue}</span>
          </div>
        </div>

        <div>
          <RowLabel label="Accordion" note="used in LibraryPage to group books by tile" />
          <div className="max-w-sm border border-gray-200 rounded-lg overflow-hidden">
            <Accordion.Root type="single" collapsible>
              <Accordion.Item value="item-1">
                <Accordion.Trigger>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">1000+ pages</span>
                    <TileBadge tileId="t03" variant="primary" />
                  </div>
                </Accordion.Trigger>
                <Accordion.Content>
                  <div className="px-4 py-3 text-sm text-gray-600 space-y-1.5">
                    <div>The Overstory · Richard Powers</div>
                    <div>The Brothers Karamazov · Dostoevsky</div>
                  </div>
                </Accordion.Content>
              </Accordion.Item>
              <Accordion.Item value="item-2">
                <Accordion.Trigger>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">Translated to English</span>
                    <TileBadge tileId="t11" variant="primary" />
                  </div>
                </Accordion.Trigger>
                <Accordion.Content>
                  <div className="px-4 py-3 text-sm text-gray-600">
                    Piranesi · Susanna Clarke
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          </div>
        </div>
      </Section>

      {/* ── OVERLAYS ── */}
      <Section id="overlays" title="Overlays: Dialog & AlertDialog">
        <div className="mb-8">
          <RowLabel label="Dialog" note="forms, editing — max-w-md, bg-black/50 overlay" />
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open Dialog
          </Button>
          <Dialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} title="Edit Book">
            <div className="space-y-4">
              <div>
                <Label className="mb-1">Book title</Label>
                <Input placeholder="e.g. The Overstory" />
              </div>
              <div>
                <Label className="mb-1">Author</Label>
                <Input placeholder="e.g. Richard Powers" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>Save</Button>
              </div>
            </div>
          </Dialog>
        </div>

        <div className="mb-6">
          <RowLabel label="AlertDialog" note="destructive confirms — max-w-sm, bg-black/50 overlay" />
          <Button variant="secondary" onClick={() => setAlertOpen(true)}>
            Open AlertDialog
          </Button>
          <AlertDialog
            isOpen={alertOpen}
            onClose={() => setAlertOpen(false)}
            onConfirm={() => setAlertOpen(false)}
            title="Delete Book?"
            message="This action cannot be undone. The book and all readings will be permanently removed."
            confirmLabel="Delete"
          />
        </div>

        <MonoNote>
          <div>Dialog: overlay bg-black/50 · content max-w-md · header strip px-4 py-3 + body p-4</div>
          <div>AlertDialog: overlay bg-black/50 · content max-w-sm · uniform p-6 (no header strip)</div>
          <div>Both: z-40 overlay / z-50 content · entrance scale-95→100 + opacity 0→1 (200ms)</div>
        </MonoNote>
      </Section>

      {/* ── TOAST ── */}
      <Section id="toast" title="Toast">
        <div className="mb-4">
          <RowLabel label="Variants" note="3 s auto-dismiss, swipe right to dismiss" />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => showSuccess('Book saved successfully')}>
              Fire success toast
            </Button>
            <Button variant="secondary" onClick={() => showError('Something went wrong')}>
              Fire error toast
            </Button>
          </div>
        </div>
        <MonoNote>
          <div>success: bg-green-500 · error: bg-red-500 · text-white text-sm font-medium</div>
          <div>position: fixed bottom-4 right-4 z-50 · rounded-lg shadow-lg px-4 py-3</div>
          <div>entrance: translate-y-2 + opacity-0 → translate-y-0 + opacity-100 (200ms)</div>
          <div>managed by ToastContext (queue-based, supports multiple concurrent toasts)</div>
        </MonoNote>
      </Section>

      {/* ── NOTES ── */}
      <Section id="notes" title="Notes">
        <NoteCallout title="Google sign-in button — intentionally hand-rolled">
          The sign-in button in App.tsx uses a raw{' '}
          <code className="bg-gray-100 px-1 rounded">&lt;button&gt;</code> with Google-brand hex colors (
          <code className="bg-gray-100 px-1 rounded">#4285F4</code> etc.) embedded in an inline SVG. This follows
          Google's sign-in button branding guidelines and should stay custom — converting it to{' '}
          <code className="bg-gray-100 px-1 rounded">Button variant="outline"</code> would lose the branded
          logo colors.
        </NoteCallout>

        <NoteCallout title="MyBooksPage FAB — intentionally not using Button">
          The floating action button uses{' '}
          <code className="bg-gray-100 px-1 rounded">w-14 h-14 rounded-full</code>. This is a genuinely
          different shape from Button's{' '}
          <code className="bg-gray-100 px-1 rounded">rounded-lg</code> base. If the FAB pattern is used
          in more than one place, extract a dedicated{' '}
          <code className="bg-gray-100 px-1 rounded">FAB</code> component. Currently it's a singleton.
        </NoteCallout>
      </Section>
    </div>
  );
}
