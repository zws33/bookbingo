import { ToggleGroup as RadixToggleGroup } from 'radix-ui';
import { cn } from '../../lib/cn.js';

const Root = ({ className, ...props }: React.ComponentProps<typeof RadixToggleGroup.Root>) => (
  <RadixToggleGroup.Root className={cn('flex gap-1', className)} {...props} />
);

const Item = ({ className, ...props }: React.ComponentProps<typeof RadixToggleGroup.Item>) => (
  <RadixToggleGroup.Item
    className={cn(
      'p-2 rounded text-gray-400 hover:text-gray-600',
      'data-[state=on]:bg-blue-100 data-[state=on]:text-blue-600',
      className,
    )}
    {...props}
  />
);

export const ToggleGroup = { Root, Item };
