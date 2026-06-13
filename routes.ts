export const publicRoutes = ["/"];

// Public catalog pages: /[business]/catalogo/*
// These are handled in middleware via pathname.includes("/catalogo")
// since Next.js middleware uses simple path matching and can't
// statically list dynamic business segments

export const authRoutes = ["/auth/login", "/auth/register", "/auth/error"];

export const apiAuthPrefix = "/api/auth";

export const DEFAULT_LOGIN_REDIRECT = "/";
