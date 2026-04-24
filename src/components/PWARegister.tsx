'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = any;

export default function PWARegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible]   = useState(false);
  const [iosVisible, setIosVisible] = useState(false);

  // Register service worker on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  // Capture the browser install prompt (Chrome / Edge / Android)
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

  // iOS Safari never fires beforeinstallprompt — show a manual hint instead.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    // Treat as "installed" when running in standalone display mode
    const isStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    const dismissed = localStorage.getItem('gs_pwa_ios_dismissed');
    if (isIOS && isSafari && !isStandalone && !dismissed) setIosVisible(true);
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

  function dismissIos() {
    setIosVisible(false);
    localStorage.setItem('gs_pwa_ios_dismissed', '1');
  }

  // iOS instructional banner
  if (iosVisible) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-50
                      bg-gray-900 border border-emerald-700/60 rounded-2xl shadow-2xl shadow-black/60
                      p-4 flex flex-col gap-2 animate-in slide-in-from-bottom-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-700/50 flex items-center justify-center shrink-0">
            <Download size={18} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Install GullySports</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-snug">
              Tap <Share size={12} className="inline-block align-[-2px] mx-0.5 text-blue-400" />
              in Safari, then <span className="text-emerald-400 font-semibold">Add to Home Screen</span>.
            </p>
          </div>
          <button onClick={dismissIos} className="text-gray-500 hover:text-gray-300 shrink-0">
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Chrome / Android / Edge install prompt banner
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
