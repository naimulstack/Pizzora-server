import { NextResponse } from "next/server";

const redirect = (request, path, callbackUrl) => {
  const url = new URL(path, request.url);
  if (callbackUrl) url.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(url.toString());
};

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return redirect(request, "/sign-in", pathname);
  }

  const res = await fetch(new URL("/api/auth/get-session", request.url), {
    headers: { cookie },
    cache: "no-store",
  }).catch(() => null);

  const data = res?.ok ? await res.json().catch(() => null) : null;
  const user = data?.user || data?.data?.user;

  if (!user) {
    return redirect(request, "/sign-in", pathname);
  }

  const role = String(user.role || "customer").trim().toLowerCase();

  if (pathname.startsWith("/dashboard/admin") && role !== "admin") {
    return redirect(request, "/unauthorized");
  }

  if (pathname.startsWith("/dashboard/vendor") && role !== "vendor") {
    return redirect(request, "/unauthorized");
  }

  if (pathname.startsWith("/dashboard/customer") && role !== "customer") {
    return redirect(request, "/unauthorized");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
