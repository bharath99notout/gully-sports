import { SkelAthleteCard, SkelLine, SkelMatchCard } from '@/components/Skeleton';

export default function PublicProfileLoading() {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 h-14" />
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex justify-end"><SkelLine w="w-24" /></div>
        <SkelAthleteCard />
        <SkelMatchCard />
        <SkelMatchCard />
      </div>
    </div>
  );
}
