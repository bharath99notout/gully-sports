'use client';

import { useEffect, useState } from 'react';
import { getCaliberColor, getCaliberLabel } from '@/lib/caliber';

export default function CaliberBar({ score, animate = true }: { score: number; animate?: boolean }) {
  const [width, setWidth] = useState(animate ? 0 : score);
  const { bar, text } = getCaliberColor(score);

  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setWidth(score), 100);
    return () => clearTimeout(t);
  }, [score, animate]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right tabular-nums ${score === 0 ? 'text-gray-700' : text}`}>
        {score}
      </span>
      <span className={`text-xs w-14 ${score === 0 ? 'text-gray-700' : text}`}>
        {getCaliberLabel(score)}
      </span>
    </div>
  );
}
