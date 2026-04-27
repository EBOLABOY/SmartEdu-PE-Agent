import { NextResponse } from "next/server";

import { getSafeAppRedirectPath } from "@/lib/auth/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectPath = getSafeAppRedirectPath(url.searchParams.get("next"));
  const redirectUrl = new URL(redirectPath, url.origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase?.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(redirectUrl);
}
