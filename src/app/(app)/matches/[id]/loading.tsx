import { SkelBlock, SkelLine } from '@/components/Skeleton';

export default function MatchLoading() {
  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <SkelLine w="w-24" />
          <SkelLine w="w-56" h="h-5" />
          <SkelLine w="w-32" />
        </div>
        <SkelLine w="w-16" h="h-8" />
      </div>
      <SkelBlock className="h-64" />
    </div>
  );
}
