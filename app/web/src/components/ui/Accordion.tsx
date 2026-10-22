import { Accordion as RadixAccordion } from 'radix-ui';
import { cn } from '../../lib/cn.js';
import { ChevronIcon } from './ChevronIcon.js';

const Root = ({
  className,
  ...props
}: React.ComponentProps<typeof RadixAccordion.Root>) => (
  <RadixAccordion.Root className={cn('w-full', className)} {...props} />
);

const Item = ({
  className,
  ...props
}: React.ComponentProps<typeof RadixAccordion.Item>) => (
  <RadixAccordion.Item
    className={cn('border-b border-outline-variant last:border-0', className)}
    {...props}
  />
);

const Trigger = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixAccordion.Trigger>) => (
  <RadixAccordion.Header className="flex">
    <RadixAccordion.Trigger
      className={cn(
        'group flex flex-1 items-center justify-between px-4 py-3',
        'text-left hover:bg-surface-container-low transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronIcon className="text-on-surface-variant transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </RadixAccordion.Trigger>
  </RadixAccordion.Header>
);

const Content = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixAccordion.Content>) => (
  <RadixAccordion.Content
    className={cn(
      'overflow-hidden',
      'data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up',
      className,
    )}
    {...props}
  >
    {children}
  </RadixAccordion.Content>
);

export const Accordion = { Root, Item, Trigger, Content };
