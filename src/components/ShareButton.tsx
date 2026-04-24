'use client';

import { useState } from 'react';
import { Share2, Check, Link2, ImageDown } from 'lucide-react';

interface Props {
  text: string;           // Message text (the URL will be appended by the share target)
  url: string;            // Absolute URL to share
  title?: string;         // Used by native share API
  label?: string;         // Button label (default "Share")
  className?: string;
  variant?: 'button' | 'icon' | 'inline';
  /**
   * Optional URL of an OG/preview image. When provided, on platforms that
   * support Web Share Level 2 (Android Chrome, modern iOS) the image is
   * shared as a real attachment so the receiver sees a photo + the link
   * instead of relying purely on the link-preview crawler.
   */
  imageUrl?: string;
  /** File name for the downloaded / shared image. */
  imageFilename?: string;
}

function whatsappHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

async function fetchImageFile(imageUrl: string, filename: string): Promise<File | null> {
  try {
    const res = await fetch(imageUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  } catch {
    return null;
  }
}

export default function ShareButton({
  text, url, title, label = 'Share', className = '',
  variant = 'button', imageUrl, imageFilename = 'gullysports-profile.png',
}: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function shareLink() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // user dismissed — fall through
      }
    }
    window.open(whatsappHref(text, url), '_blank', 'noopener,noreferrer');
  }

  async function shareWithImage() {
    if (!imageUrl) return shareLink();
    setBusy(true);
    try {
      const file = await fetchImageFile(imageUrl, imageFilename);
      // Web Share Level 2 — share image as an attachment alongside text
      if (file && typeof navigator !== 'undefined' && 'canShare' in navigator
          && (navigator as Navigator & { canShare: (d: ShareData) => boolean }).canShare({ files: [file] })) {
        try {
          await (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
            .share({ title, text: `${text}\n${url}`, files: [file] });
          return;
        } catch {
          // user dismissed — fall through to download
        }
      }
      // Desktop / no file-share support → download the PNG so the user can attach it manually
      if (file) {
        const objUrl = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = imageFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
        // Also copy the text+link to clipboard so it's easy to paste with the image
        try { await navigator.clipboard.writeText(`${text}\n${url}`); } catch {}
        return;
      }
      // Last-ditch fallback
      await shareLink();
    } finally {
      setBusy(false);
    }
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
      <button onClick={imageUrl ? shareWithImage : shareLink} title="Share"
        className={`p-2 rounded-lg hover:bg-gray-800 transition-colors ${className}`} disabled={busy}>
        <Share2 size={16} className="text-gray-400" />
      </button>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="inline-flex items-center gap-2">
        <button onClick={shareLink}
          className={`inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors ${className}`}>
          <Share2 size={12} /> {label}
        </button>
        {imageUrl && (
          <button onClick={shareWithImage} disabled={busy}
            title="Share as image"
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-300 transition-colors disabled:opacity-50">
            <ImageDown size={12} /> {busy ? 'Preparing…' : 'Image'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button onClick={shareLink}
        className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 py-2 text-sm font-bold">
        <Share2 size={14} /> {label}
      </button>
      {imageUrl && (
        <button onClick={shareWithImage} disabled={busy}
          title="Share as image"
          className="flex items-center justify-center gap-1.5 border border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/30 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50">
          <ImageDown size={14} /> {busy ? 'Preparing…' : 'Image'}
        </button>
      )}
      <button onClick={copy}
        title={copied ? 'Copied!' : 'Copy link'}
        className="p-2 rounded-xl border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white">
        {copied ? <Check size={14} className="text-emerald-400" /> : <Link2 size={14} />}
      </button>
    </div>
  );
}
