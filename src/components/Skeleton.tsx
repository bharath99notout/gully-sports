/** Tiny skeleton primitives for `loading.tsx` files. Server-renderable. */
export function SkelLine({ w = 'w-full', h = 'h-3', className = '' }: { w?: string; h?: string; className?: string }) {
  return <div className={`${w} ${h} rounded bg-gray-800 animate-pulse ${className}`} />;
}

export function SkelBlock({ className = '' }: { className?: string }) {
  return <div className={`rounded-2xl bg-gray-900 border border-gray-800 animate-pulse ${className}`} />;
}

export function SkelAthleteCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="h-20 bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800" />
      <div className="px-5 pb-5">
        <div className="-mt-10 mb-4">
          <div className="w-20 h-20 rounded-full bg-gray-800 border-4 border-gray-900 animate-pulse" />
        </div>
        <SkelLine w="w-40" h="h-5" />
        <div className="mt-2"><SkelLine w="w-32" /></div>
        <div className="flex flex-col gap-3 mt-5">
          <SkelLine h="h-4" />
          <SkelLine h="h-4" />
          <SkelLine h="h-4" />
          <SkelLine h="h-4" />
        </div>
      </div>
    </div>
  );
}

export function SkelMatchCard() {
  return <SkelBlock className="h-28" />;
}
