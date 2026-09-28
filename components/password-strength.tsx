import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const strengthVariants = cva('h-1.5 flex-1 rounded-full transition-colors', {
  variants: {
    level: {
      empty: 'bg-muted',
      weak: 'bg-red-500',
      fair: 'bg-orange-500',
      good: 'bg-yellow-500',
      strong: 'bg-blue-500',
      veryStrong: 'bg-green-500',
    },
  },
  defaultVariants: { level: 'empty' },
});

const levelLabels = ['非常弱', '弱', '一般', '强', '非常强'] as const;
const levelKeys = ['weak', 'fair', 'good', 'strong', 'veryStrong'] as const;

function PasswordStrength({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(4, score));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              strengthVariants({ level: i <= clamped ? levelKeys[clamped] : 'empty' })
            )}
          />
        ))}
      </div>
      <span className="w-14 text-right text-xs text-muted-foreground">
        {levelLabels[clamped]}
      </span>
    </div>
  );
}

export { PasswordStrength };
