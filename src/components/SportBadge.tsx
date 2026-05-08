import { SportType } from '@/types';
import SportIcon from './SportIcon';

const sportConfig: Record<SportType, { label: string; color: string }> = {
  cricket:      { label: 'Cricket',      color: 'bg-blue-900/50 text-blue-400 border-blue-800' },
  football:     { label: 'Football',     color: 'bg-green-900/50 text-green-400 border-green-800' },
  badminton:    { label: 'Badminton',    color: 'bg-yellow-900/50 text-yellow-400 border-yellow-800' },
  table_tennis: { label: 'Table Tennis', color: 'bg-orange-900/50 text-orange-400 border-orange-800' },
  foosball:     { label: 'Foosball',     color: 'bg-purple-900/50 text-purple-400 border-purple-800' },
};

export default function SportBadge({ sport }: { sport: SportType }) {
  const { label, color } = sportConfig[sport];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${color}`}>
      <SportIcon sport={sport} /> {label}
    </span>
  );
}
