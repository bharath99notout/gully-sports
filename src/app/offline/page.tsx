export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="text-5xl mb-4">📡</div>
        <h1 className="text-2xl font-bold mb-2">You&rsquo;re offline</h1>
        <p className="text-sm text-gray-400 mb-6">
          Check your internet connection. Previously viewed pages may still work.
        </p>
        <a href="/dashboard"
          className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
          Try again
        </a>
      </div>
    </div>
  );
}
