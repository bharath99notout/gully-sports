'use client';

import { MessageCircle } from 'lucide-react';
import { buildPickupWhatsAppInvite, type PickupShareFields } from '@/lib/pickupShareText';

type Props = { fields: PickupShareFields };

export default function PickupShareWhatsApp({ fields }: Props) {
  return (
    <button
      type="button"
      onClick={() => {
        const text = buildPickupWhatsAppInvite(fields);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      }}
      className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-700/60 bg-emerald-950/30 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-950/50 hover:border-emerald-600 transition-colors"
    >
      <MessageCircle size={18} className="shrink-0" />
      Share invite on WhatsApp
    </button>
  );
}
