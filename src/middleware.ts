import { auth } from "../auth";
import { apiAuthPrefix, authRoutes, publicRoutes } from "../routes";

export default auth((req) => {
  const { nextUrl } = req;

  const isLoggedIn = !!req.auth;
  console.log(nextUrl.pathname);
  const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix);
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);
  if (isApiAuthRoute) {
    return;
  }
  if (nextUrl.pathname.includes("/catalogo")) {
    return;
  }
  console.log({ isLoggedIn });
  console.log({ isPublicRoute });
  if (isAuthRoute) {
    if (isLoggedIn) {
      // return NextResponse.redirect(new URL("/settings", nextUrl).toString());
      // return NextResponse.rewrite(new URL("/settings", nextUrl).toString());
      return Response.redirect(new URL("/", nextUrl));
    }
    return;
  }
  if (!isLoggedIn && !isPublicRoute) {
    // return NextResponse.rewrite(new URL("/auth/login", nextUrl).toString());
    return Response.redirect(new URL("/auth/login", nextUrl));
  }
  return;
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
