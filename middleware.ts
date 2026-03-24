import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder assets
     * - api/email/inbound (Resend webhook — uses its own signature verification)
     * - api/stripe/webhook (Stripe webhook — uses its own signature verification)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/email/inbound|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
