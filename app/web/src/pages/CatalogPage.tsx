import { useEffect, useState } from 'react';
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

// This dev-only page is a LIVING reference: color and radius samples are read
// from the actual CSS custom properties at runtime (see useCssVars), so it cannot
// drift from the tokens in index.css the way hardcoded swatch labels did.

const NAV = [
  { id: 'colors', label: 'Colors' },
  { id: 'typography', label: 'Typography' },
  { id: 'shape', label: 'Shape' },
  { id: 'button', label: 'Button' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'badges', label: 'Badges' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'spinner', label: 'Spinner' },
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'controls', label: 'Controls' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'toast', label: 'Toast' },
];

const COLOR_GROUPS: { title: string; roles: string[] }[] = [
  { title: 'Primary', roles: ['primary', 'on-primary', 'primary-container', 'on-primary-container'] },
  { title: 'Secondary', roles: ['secondary', 'on-secondary', 'secondary-container', 'on-secondary-container'] },
  {
    title: 'Surface (tonal elevation)',
    roles: [
      'surface',
      'surface-container-lowest',
      'surface-container-low',
      'surface-container',
      'surface-container-high',
      'surface-container-highest',
      'on-surface',
      'on-surface-variant',
    ],
  },
  { title: 'Outline', roles: ['outline', 'outline-variant'] },
  { title: 'Status', roles: ['error', 'on-error', 'error-container', 'on-error-container', 'success', 'on-success'] },
  { title: 'Inverse', roles: ['inverse-surface', 'inverse-on-surface'] },
];

const TYPE_ROLES: { className: string; role: string }[] = [
  { className: 'font-display text-display-lg', role: 'display-lg' },
  { className: 'font-display text-headline-lg', role: 'headline-lg' },
  { className: 'font-display text-headline-md', role: 'headline-md' },
  { className: 'font-display text-headline-sm', role: 'headline-sm' },
  { className: 'font-body text-body-lg', role: 'body-lg' },
  { className: 'font-body text-body-md', role: 'body-md' },
  { className: 'font-body text-body-sm', role: 'body-sm' },
  { className: 'font-body text-label-caps uppercase', role: 'label-caps' },
];

const RADII: { className: string; role: string }[] = [
  { className: 'rounded-sm', role: 'sm' },
  { className: 'rounded-md', role: 'md' },
  { className: 'rounded-lg', role: 'lg (cards/buttons)' },
  { className: 'rounded-xl', role: 'xl' },
  { className: 'rounded-full', role: 'full (pills)' },
];

/** Read the resolved values of CSS custom properties from :root at runtime. */
function useCssVars(names: string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const name of names) next[name] = cs.getPropertyValue(name).trim();
    setValues(next);
    // names is a stable module-level array; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return values;
}

const COLOR_VARS = COLOR_GROUPS.flatMap((g) => g.roles.map((r) => `--color-${r}`));
const RADIUS_VARS = ['sm', 'md', 'lg', 'xl'].map((r) => `--radius-${r}`);

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 mb-16">
      <h2 className="font-display text-headline-md text-on-surface mb-5 pb-2 border-b border-outline-variant">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RowLabel({ label, note }: { label: string; note?: string }) {
  return (
    <div className="text-label-caps uppercase text-on-surface-variant mb-3">
      {label}
      {note && <span className="ml-2 normal-case tracking-normal font-normal">— {note}</span>}
    </div>
  );
}

function Swatch({ role, value }: { role: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-14 w-full rounded-sm border border-outline-variant"
        style={{ background: `var(--color-${role})` }}
      />
      <span className="text-label-caps uppercase text-on-surface">{role}</span>
      <span className="text-xs text-on-surface-variant">{value || '—'}</span>
    </div>
  );
}

function MonoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 p-3 bg-surface-container rounded-sm text-xs text-on-surface-variant space-y-1">
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

  const colorValues = useCssVars(COLOR_VARS);
  const radiusValues = useCssVars(RADIUS_VARS);

  const handleLoadingDemo = () => {
    setLoadingDemo(true);
    setTimeout(() => setLoadingDemo(false), 2000);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-headline-lg text-on-surface">UI Catalog</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Live design-system reference — colors and radii are read from the CSS tokens at
          runtime, so they always match <code className="text-on-surface">index.css</code>. Dev only.
        </p>
      </div>

      {/* Jump nav */}
      <div className="sticky top-0 z-10 bg-surface border-b border-outline-variant -mx-4 px-4 mb-10">
        <nav className="flex gap-1 overflow-x-auto py-2" aria-label="Catalog sections">
          {NAV.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 text-label-caps uppercase text-on-surface-variant hover:text-primary px-2 py-1 rounded-sm transition-colors whitespace-nowrap"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* ── COLORS ── */}
      <Section id="colors" title="Color tokens">
        <p className="text-sm text-on-surface-variant mb-6 max-w-2xl">
          Semantic MD3-style roles. Each color pairs with its <code>on-</code> foreground (the
          accessible text/icon color to use on top of it). Surfaces form a warm tonal ramp used
          for elevation instead of shadows.
        </p>
        <div className="space-y-6">
          {COLOR_GROUPS.map((group) => (
            <div key={group.title}>
              <RowLabel label={group.title} />
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {group.roles.map((role) => (
                  <Swatch key={role} role={role} value={colorValues[`--color-${role}`]} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── TYPOGRAPHY ── */}
      <Section id="typography" title="Typography">
        <p className="text-sm text-on-surface-variant mb-6 max-w-2xl">
          Display/headline roles are <strong className="font-display">Noto Serif</strong> (editorial
          chrome); body and labels are <strong>Inter</strong>. Family (<code>font-display</code> /{' '}
          <code>font-body</code>) is a separate axis from the size role (<code>text-*</code>).
        </p>
        <div className="space-y-6 bg-surface-container-lowest p-6 rounded-lg border border-outline-variant">
          {TYPE_ROLES.map(({ className, role }) => (
            <div key={role} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 border-b border-outline-variant pb-4 last:border-0 last:pb-0">
              <div className="w-40 shrink-0 text-label-caps uppercase text-primary">{role}</div>
              <div className={`${className} text-on-surface`}>The curated reading experience</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── SHAPE ── */}
      <Section id="shape" title="Shape & elevation">
        <div className="mb-8">
          <RowLabel label="Border radius" note="paper-sharp; rounded-lg is the card/control default" />
          <div className="flex flex-wrap gap-6">
            {RADII.map(({ className, role }) => {
              const key = `--radius-${role.split(' ')[0]}`;
              return (
                <div key={role} className="flex flex-col items-center gap-2">
                  <div className={`w-16 h-16 bg-surface-container-highest border border-outline-variant ${className}`} />
                  <span className="text-label-caps uppercase text-on-surface text-center leading-tight max-w-[90px]">{role}</span>
                  <span className="text-xs text-on-surface-variant">{radiusValues[key] ?? ''}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <RowLabel label="Elevation" note="tonal surfaces preferred; shadows for overlays" />
          <div className="flex flex-wrap gap-6">
            {['shadow-sm', 'shadow', 'shadow-lg', 'shadow-xl'].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <div className={`w-16 h-16 bg-surface-container-lowest rounded-lg ${s}`} />
                <span className="text-xs text-on-surface-variant font-mono">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── BUTTON ── */}
      <Section id="button" title="Button">
        <RowLabel label="Variants" note="base: inline-flex items-center gap-2 px-4 py-2 rounded-lg" />
        <div className="flex flex-wrap gap-4 mb-6">
          {(['primary', 'secondary', 'outline', 'ghost', 'danger'] as const).map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-1">
              <Button variant={variant}>{variant[0].toUpperCase() + variant.slice(1)}</Button>
              <span className="text-xs text-on-surface-variant font-mono">{variant}</span>
            </div>
          ))}
        </div>
        <RowLabel label="Disabled / loading" note="loading auto-disables and shows a Spinner" />
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="primary" loading={loadingDemo} onClick={handleLoadingDemo}>Save Book</Button>
          <Button variant="secondary" loading={loadingDemo}>Searching…</Button>
        </div>
      </Section>

      {/* ── INPUTS ── */}
      <Section id="inputs" title="Input & Textarea">
        <div className="flex flex-wrap gap-6">
          <div className="w-56">
            <Label className="mb-1">Book title</Label>
            <Input placeholder="e.g. The Overstory" />
          </div>
          <div className="w-56">
            <Label className="mb-1">With error</Label>
            <Input error="Title is required" placeholder="e.g. The Overstory" />
            <p className="mt-1 text-xs text-error">Title is required</p>
          </div>
          <div className="w-56">
            <Label className="mb-1">Notes</Label>
            <Textarea placeholder="What did you think?" rows={3} />
          </div>
        </div>
      </Section>

      {/* ── BADGES ── */}
      <Section id="badges" title="Tile badges">
        <RowLabel label="Primary / secondary" note="outlined UPPERCASE label-caps at 10px" />
        <div className="flex flex-wrap gap-2 mb-4">
          {['t01', 't04', 't11', 't18'].map((id) => (
            <TileBadge key={id} tileId={id} variant="primary" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {['t01', 't04', 't11'].map((id) => (
            <TileBadge key={id} tileId={id} variant="secondary" />
          ))}
        </div>
      </Section>

      {/* ── AVATAR ── */}
      <Section id="avatar" title="Avatar">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col items-center gap-2">
            <Avatar name="Zach Smith" size="sm" />
            <span className="text-xs text-on-surface-variant font-mono">sm</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Avatar name="Zach Smith" size="md" />
            <span className="text-xs text-on-surface-variant font-mono">md</span>
          </div>
        </div>
      </Section>

      {/* ── SPINNER ── */}
      <Section id="spinner" title="Spinner">
        <div className="flex flex-wrap items-center gap-6">
          <Spinner className="w-4 h-4 text-primary" />
          <Spinner className="w-6 h-6 text-primary" />
          <Spinner className="w-8 h-8 text-on-surface-variant" />
        </div>
        <MonoNote>
          <div>aria-hidden decorative · currentColor fill (text-* controls it)</div>
        </MonoNote>
      </Section>

      {/* ── TOOLTIP ── */}
      <Section id="tooltip" title="Tooltip">
        <div className="flex flex-wrap items-center gap-8">
          <Tooltip content="1 point per unique category covered.">
            <Button variant="secondary">Hover me (top)</Button>
          </Tooltip>
          <Tooltip content="Bonus for repeat books, with diminishing returns." side="right">
            <span className="text-sm text-on-surface-variant underline decoration-dotted cursor-help">
              inline trigger (right)
            </span>
          </Tooltip>
        </div>
        <MonoNote>
          <div>Radix portal · bg-inverse-surface · delay 200ms · sideOffset 6px</div>
        </MonoNote>
      </Section>

      {/* ── CONTROLS ── */}
      <Section id="controls" title="Controls: ToggleGroup & Accordion">
        <div className="mb-8">
          <RowLabel label="ToggleGroup" note="single-select icon toggles" />
          <div className="flex items-center gap-4">
            <ToggleGroup.Root type="single" value={toggleValue} onValueChange={(v) => v && setToggleValue(v)}>
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
            <span className="text-xs text-on-surface-variant font-mono">active: {toggleValue}</span>
          </div>
        </div>
        <div>
          <RowLabel label="Accordion" note="used in Library to group books by tile" />
          <div className="max-w-sm border border-outline-variant rounded-lg overflow-hidden">
            <Accordion.Root type="single" collapsible>
              <Accordion.Item value="item-1">
                <Accordion.Trigger>
                  <span className="text-sm font-medium text-on-surface">1000+ pages</span>
                </Accordion.Trigger>
                <Accordion.Content>
                  <div className="px-4 py-3 text-sm text-on-surface-variant">The Overstory · Richard Powers</div>
                </Accordion.Content>
              </Accordion.Item>
              <Accordion.Item value="item-2">
                <Accordion.Trigger>
                  <span className="text-sm font-medium text-on-surface">Translated to English</span>
                </Accordion.Trigger>
                <Accordion.Content>
                  <div className="px-4 py-3 text-sm text-on-surface-variant">Piranesi · Susanna Clarke</div>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          </div>
        </div>
      </Section>

      {/* ── OVERLAYS ── */}
      <Section id="overlays" title="Overlays: Dialog & AlertDialog">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open Dialog</Button>
          <Button variant="secondary" onClick={() => setAlertOpen(true)}>Open AlertDialog</Button>
        </div>
        <Dialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} title="Edit Book">
          <div className="space-y-4">
            <div>
              <Label className="mb-1">Book title</Label>
              <Input placeholder="e.g. The Overstory" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>Save</Button>
            </div>
          </div>
        </Dialog>
        <AlertDialog
          isOpen={alertOpen}
          onClose={() => setAlertOpen(false)}
          onConfirm={() => setAlertOpen(false)}
          title="Delete Book?"
          message="This action cannot be undone."
          confirmLabel="Delete"
        />
        <MonoNote>
          <div>overlay bg-black/50 (scrim) · content bg-surface-container-lowest · serif titles</div>
        </MonoNote>
      </Section>

      {/* ── TOAST ── */}
      <Section id="toast" title="Toast">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => showSuccess('Book saved successfully')}>Fire success</Button>
          <Button variant="secondary" onClick={() => showError('Something went wrong')}>Fire error</Button>
        </div>
        <MonoNote>
          <div>success: bg-success · error: bg-error · bottom-4 right-4 · 3s auto-dismiss</div>
        </MonoNote>
      </Section>
    </div>
  );
}
