import { SportType } from '@/types';

const sportConfig: Record<SportType, { label: string; color: string; emoji: string }> = {
  cricket:      { label: 'Cricket',     color: 'bg-blue-900/50 text-blue-400 border-blue-800',       emoji: '🏏' },
  football:     { label: 'Football',    color: 'bg-green-900/50 text-green-400 border-green-800',    emoji: '⚽' },
  badminton:    { label: 'Badminton',   color: 'bg-yellow-900/50 text-yellow-400 border-yellow-800', emoji: '🏸' },
  table_tennis: { label: 'Table Tennis', color: 'bg-orange-900/50 text-orange-400 border-orange-800', emoji: '🏓' },
};

export default function SportBadge({ sport }: { sport: SportType }) {
  const { label, color, emoji } = sportConfig[sport];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${color}`}>
      {emoji} {label}
    </span>
  );
}
