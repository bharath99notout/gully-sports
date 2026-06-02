import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerAuth } from '@/lib/supabase/server';
import BowlingSpeedCapture from './BowlingSpeedCapture';

export const metadata = {
  title: 'Capture bowling speed — GullySports',
};

export default async function NewBowlingDeliveryPage() {
  const { user } = await getServerAuth();
  if (!user) redirect('/auth/login?next=/bowling/new');

  return (
    <div className="max-w-md mx-auto px-4 py-6 flex flex-col gap-5">
      <Link href="/bowling" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
        <ArrowLeft size={14} /> Back
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-white">Capture a delivery</h1>
        <p className="text-sm text-gray-500 mt-0.5">Two taps. Release → bounce. We do the math.</p>
      </div>
      <BowlingSpeedCapture />
    </div>
  );
}
