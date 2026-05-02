import { cn } from '../../lib/cn.js';

interface AvatarProps {
  name: string;
  photoURL?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
};

export function Avatar({ name, photoURL, size = 'md', className }: AvatarProps) {
  const base = cn('rounded-full flex-shrink-0', sizeClasses[size], className);

  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name}
        className={cn(base, 'object-cover')}
      />
    );
  }

  return (
    <span
      className={cn(base, 'bg-gray-200 text-gray-600 flex items-center justify-center font-medium select-none')}
      aria-label={name}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
