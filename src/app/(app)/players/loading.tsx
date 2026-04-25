import { SkelBlock, SkelLine } from '@/components/Skeleton';

export default function PlayersLoading() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <SkelLine w="w-32" h="h-6" />
      <SkelBlock className="h-12" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <SkelBlock key={i} className="h-44" />)}
      </div>
    </div>
  );
}
