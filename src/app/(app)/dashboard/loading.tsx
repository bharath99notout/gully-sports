import { SkelAthleteCard, SkelLine, SkelMatchCard } from '@/components/Skeleton';

export default function DashboardLoading() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <SkelLine w="w-48" h="h-6" />
        <div className="mt-2"><SkelLine w="w-32" /></div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 h-14 animate-pulse" />
      <SkelAthleteCard />
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 border border-gray-800 rounded-xl py-2.5 h-10 animate-pulse" />
        <div className="bg-gray-900 border border-gray-800 rounded-xl py-2.5 h-10 animate-pulse" />
        <div className="bg-gray-900 border border-gray-800 rounded-xl py-2.5 h-10 animate-pulse" />
        <div className="bg-gray-900 border border-gray-800 rounded-xl py-2.5 h-10 animate-pulse" />
      </div>
      <div className="flex flex-col gap-3">
        <SkelMatchCard />
        <SkelMatchCard />
        <SkelMatchCard />
      </div>
    </div>
  );
}
