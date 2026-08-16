import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((request) => {
  if (request.auth?.user?.id) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/app/:path*"],
};
