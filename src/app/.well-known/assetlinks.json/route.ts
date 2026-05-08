/**
 * Digital Asset Links file — proves to Chrome / Android that the Play-Store
 * app and this web origin are owned by the same publisher. Without it,
 * the TWA shows the URL bar (and the app feels like a browser).
 *
 * STATUS: stub. The Play Store package name + signing-key SHA-256 are
 * unknown until Bubblewrap generates the keystore. Once that's done,
 * fill in PLAY_STORE_PACKAGE_NAME + PLAY_STORE_KEYSTORE_SHA256 below.
 *
 * Verify after deploy with:
 *   curl https://gully-sports.vercel.app/.well-known/assetlinks.json
 *
 * Or via Google's tester:
 *   https://developers.google.com/digital-asset-links/tools/generator
 */

export const dynamic = 'force-static';

interface AssetLink {
  relation: string[];
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

const PLAY_STORE_PACKAGE_NAME = process.env.PLAY_STORE_PACKAGE_NAME ?? '';
const PLAY_STORE_KEYSTORE_SHA256 = process.env.PLAY_STORE_KEYSTORE_SHA256 ?? '';

export function GET() {
  const links: AssetLink[] = [];

  if (PLAY_STORE_PACKAGE_NAME && PLAY_STORE_KEYSTORE_SHA256) {
    links.push({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: PLAY_STORE_PACKAGE_NAME,
        sha256_cert_fingerprints: [PLAY_STORE_KEYSTORE_SHA256],
      },
    });
  }

  return new Response(JSON.stringify(links, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Google's verifier hits this directly; cache for an hour to limit traffic.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
