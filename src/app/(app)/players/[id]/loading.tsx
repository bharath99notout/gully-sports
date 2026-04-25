import { SkelAthleteCard, SkelLine, SkelMatchCard } from '@/components/Skeleton';

export default function PlayerLoading() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <SkelLine w="w-20" />
        <SkelLine w="w-24" />
      </div>
      <div>
        <SkelLine w="w-24" />
        <div className="mt-2"><SkelLine w="w-44" h="h-6" /></div>
      </div>
      <SkelAthleteCard />
      <SkelMatchCard />
      <SkelMatchCard />
    </div>
  );
}
