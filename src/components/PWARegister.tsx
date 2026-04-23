'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = any;

export default function PWARegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible]   = useState(false);

  // Register service worker on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return; // SW only in prod builds

    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  // Capture the browser install prompt
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem('gs_pwa_dismissed');

    function onBip(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!dismissed) setVisible(true);
    }
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDeferred(null); setVisible(false);
      if (outcome === 'dismissed') localStorage.setItem('gs_pwa_dismissed', '1');
    }
  }

  function dismiss() {
    setVisible(false);
    localStorage.setItem('gs_pwa_dismissed', '1');
  }

  if (!visible) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-50
                    bg-gray-900 border border-emerald-700/60 rounded-2xl shadow-2xl shadow-black/60
                    p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4">
      <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-700/50 flex items-center justify-center shrink-0">
        <Download size={18} className="text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">Install GullySports</p>
        <p className="text-xs text-gray-400 truncate">Faster access, works offline, home-screen icon.</p>
      </div>
      <button onClick={install}
        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0">
        Install
      </button>
      <button onClick={dismiss} className="text-gray-500 hover:text-gray-300 shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
