import { auth } from "./auth.edge";
import { apiAuthPrefix, authRoutes, publicRoutes } from "../routes";

export default auth((req) => {
  const { nextUrl } = req;

  const isLoggedIn = !!req.auth;
  const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix);
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);
  const isPublicCatalog = nextUrl.pathname.includes("/catalogo");
  const isApiRoute = nextUrl.pathname.startsWith("/api/");

  // 1. Allow NextAuth API routes (they handle authentication internally)
  if (isApiAuthRoute) {
    return;
  }

  // 2. Allow public catalog pages: /[business]/catalogo/*
  // These are business-facing public product pages that don't require login
  if (isPublicCatalog) {
    return;
  }

  // 3. Protect non-public API routes
  // /api/auth is handled above; all other API routes require authentication
  // /api/catalog (future) is intentionally public for catalog data fetching
  if (isApiRoute && !nextUrl.pathname.startsWith("/api/catalog")) {
    if (!isLoggedIn) {
      return Response.redirect(new URL("/auth/login", nextUrl));
    }
    return;
  }

  // 4. Auth routes (login, register, error): redirect authenticated users to home
  if (isAuthRoute) {
    if (isLoggedIn) {
      return Response.redirect(new URL("/", nextUrl));
    }
    return;
  }

  // 5. Protected routes: redirect unauthenticated users to login
  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(new URL("/auth/login", nextUrl));
  }

  return;
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
