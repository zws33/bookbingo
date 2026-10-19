import { DropdownMenu as RadixDropdownMenu } from 'radix-ui';
import { cn } from '../../lib/cn.js';

const Root = RadixDropdownMenu.Root;

const Trigger = ({
  className,
  ...props
}: React.ComponentProps<typeof RadixDropdownMenu.Trigger>) => (
  <RadixDropdownMenu.Trigger
    className={cn(
      'inline-flex items-center gap-2 rounded-lg px-3 py-1.5',
      'text-on-surface hover:bg-surface-container',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      'data-[state=open]:bg-surface-container',
      className,
    )}
    {...props}
  />
);

const Content = ({
  className,
  sideOffset = 6,
  align = 'start',
  ...props
}: React.ComponentProps<typeof RadixDropdownMenu.Content>) => (
  <RadixDropdownMenu.Portal>
    <RadixDropdownMenu.Content
      sideOffset={sideOffset}
      align={align}
      className={cn(
        'z-50 min-w-64 max-w-[calc(100vw-2rem)] overflow-hidden',
        'rounded-lg border border-outline-variant bg-surface-container-lowest shadow-xl',
        'p-1',
        className,
      )}
      {...props}
    />
  </RadixDropdownMenu.Portal>
);

const Item = ({
  className,
  ...props
}: React.ComponentProps<typeof RadixDropdownMenu.Item>) => (
  <RadixDropdownMenu.Item
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2',
      'text-sm text-on-surface outline-none',
      'data-[highlighted]:bg-surface-container',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
);

const Label = ({
  className,
  ...props
}: React.ComponentProps<typeof RadixDropdownMenu.Label>) => (
  <RadixDropdownMenu.Label
    className={cn(
      'px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant',
      className,
    )}
    {...props}
  />
);

const Separator = ({
  className,
  ...props
}: React.ComponentProps<typeof RadixDropdownMenu.Separator>) => (
  <RadixDropdownMenu.Separator
    className={cn('my-1 h-px bg-outline-variant', className)}
    {...props}
  />
);

export const DropdownMenu = {
  Root,
  Trigger,
  Content,
  Item,
  Label,
  Separator,
};
