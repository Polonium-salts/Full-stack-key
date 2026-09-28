import { cn } from '@/lib/utils/cn';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-accent', className)}
      {...props}
    />
  );
}

export { Skeleton };
