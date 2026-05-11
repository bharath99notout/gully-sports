import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Skip auth middleware if Supabase isn't configured yet
  if (!supabaseUrl || supabaseUrl === 'your_supabase_project_url') {
    return NextResponse.next({ request });
  }

  // App Router API routes must not be redirected to /auth/login — the browser would
  // follow the redirect and parse HTML as JSON (e.g. magic-phone-otp → "Invalid response from server").
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthPage = pathname.startsWith('/auth');
  // Public assets that must be reachable without auth — required by:
  //   - browsers / Android (PWA install)
  //   - Bubblewrap / TWA build (manifest fetch)
  //   - Google Digital Asset Links verifier (.well-known/assetlinks.json)
  // Returning HTML from these routes (the /auth/login redirect) breaks the
  // TWA build with "Unexpected token '<' is not valid JSON".
  const isPwaAsset =
    pathname === '/manifest.webmanifest' ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/.well-known/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/apple-icon.png' ||
    pathname === '/opengraph-image' ||
    pathname === '/twitter-image';
  const isPublicPage = pathname === '/'
    || pathname.startsWith('/p/') // /p/[id] → public player profile
    || isPwaAsset;

  if (!user && !isAuthPage && !isPublicPage) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Allow /auth/signup even when logged in (used for name setup after OTP)
  if (user && isAuthPage && request.nextUrl.pathname !== '/auth/signup') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
