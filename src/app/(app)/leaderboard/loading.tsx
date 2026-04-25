import { SkelBlock, SkelLine } from '@/components/Skeleton';

export default function LeaderboardLoading() {
  return (
    <div className="max-w-2xl mx-auto">
      <SkelLine w="w-48" h="h-6" />
      <div className="mt-2 mb-5"><SkelLine w="w-72" /></div>
      <div className="flex gap-2 mb-4">
        <SkelLine w="w-16" h="h-8" />
        <SkelLine w="w-20" h="h-8" />
        <SkelLine w="w-20" h="h-8" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => <SkelBlock key={i} className="h-16" />)}
      </div>
    </div>
  );
}
