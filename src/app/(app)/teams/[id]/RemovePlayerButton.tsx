'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Trash2 } from 'lucide-react';

export default function RemovePlayerButton({ memberId, teamId }: { memberId: string; teamId: string }) {
  const router = useRouter();

  async function handleRemove() {
    const supabase = createClient();
    await supabase.from('team_members').delete().eq('id', memberId);
    router.refresh();
  }

  return (
    <button
      onClick={handleRemove}
      className="text-gray-600 hover:text-red-400 transition-colors p-1"
      title="Remove player"
    >
      <Trash2 size={15} />
    </button>
  );
}
