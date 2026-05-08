import { renderTrophyIcon } from '@/lib/trophyIcon';

export const runtime = 'edge';

export function GET() {
  return renderTrophyIcon(512);
}
