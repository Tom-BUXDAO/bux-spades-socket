import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Skip auth for test routes
  if (request.nextUrl.pathname.startsWith('/game/test_')) {
    return NextResponse.next();
  }

  // Skip auth for test socket connections
  if (request.nextUrl.pathname.startsWith('/socket.io/') && 
      request.nextUrl.searchParams.get('clientId')?.startsWith('test_')) {
    return NextResponse.next();
  }

  // For all other routes, check if user is authenticated
  const sessionToken = request.cookies.get('next-auth.session-token');
  
  if (!sessionToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (login page)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)',
  ],
} 