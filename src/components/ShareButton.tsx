'use client';

import { useState } from 'react';
import { Share2, Check, Link2 } from 'lucide-react';

interface Props {
  text: string;           // Message text (the URL will be appended by the share target)
  url: string;            // Absolute URL to share
  title?: string;         // Used by native share API
  label?: string;         // Button label (default "Share")
  className?: string;
  variant?: 'button' | 'icon' | 'inline';
}

function whatsappHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

export default function ShareButton({
  text, url, title, label = 'Share', className = '', variant = 'button',
}: Props) {
  const [copied, setCopied] = useState(false);

  async function share() {
    // Prefer native share sheet on mobile (offers WhatsApp + more)
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // User dismissed — fall through to WhatsApp
      }
    }
    // Desktop / unsupported → open WhatsApp Web/app directly
    window.open(whatsappHref(text, url), '_blank', 'noopener,noreferrer');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this:', `${text} ${url}`);
    }
  }

  if (variant === 'icon') {
    return (
      <button onClick={share} title="Share" className={`p-2 rounded-lg hover:bg-gray-800 transition-colors ${className}`}>
        <Share2 size={16} className="text-gray-400" />
      </button>
    );
  }

  if (variant === 'inline') {
    return (
      <button onClick={share}
        className={`inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors ${className}`}>
        <Share2 size={12} /> {label}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button onClick={share}
        className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 py-2 text-sm font-bold">
        <Share2 size={14} /> {label}
      </button>
      <button onClick={copy}
        title={copied ? 'Copied!' : 'Copy link'}
        className="p-2 rounded-xl border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white">
        {copied ? <Check size={14} className="text-emerald-400" /> : <Link2 size={14} />}
      </button>
    </div>
  );
}
