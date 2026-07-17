import { ToggleGroup as RadixToggleGroup } from 'radix-ui';
import { cn } from '../../lib/cn.js';

const Root = ({ className, ...props }: React.ComponentProps<typeof RadixToggleGroup.Root>) => (
  <RadixToggleGroup.Root className={cn('flex gap-1', className)} {...props} />
);

const Item = ({ className, ...props }: React.ComponentProps<typeof RadixToggleGroup.Item>) => (
  <RadixToggleGroup.Item
    className={cn(
      'p-2 rounded-sm text-outline hover:text-on-surface-variant',
      'data-[state=on]:bg-primary-container data-[state=on]:text-on-primary-container',
      className,
    )}
    {...props}
  />
);

export const ToggleGroup = { Root, Item };
