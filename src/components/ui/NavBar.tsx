"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { UserButton } from "../auth/user-button";
import { useSession } from "next-auth/react";
import { Button } from "./button";
import { LoginButton } from "../auth/login-button";
import { useMobileNav } from "@/context/MobileNavContext";
import { Menu, X } from "lucide-react";

export function NavigationMenuHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav();
  const businessName = session?.user?.businessName || "Stock.ia";

  // Ocultar el header en el catálogo público
  if (pathname?.includes("/catalogo")) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/60 dark:border-gray-800/50 bg-white/75 dark:bg-gray-950/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-gray-950/60">
      <div className="flex items-center justify-between h-14 px-4 mx-auto max-w-screen-2xl">
        {/* Left: mobile menu trigger */}
        <div className="flex items-center w-28">
          {session && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>

        {/* Center: business name */}
        <Link href="/" className="flex-1 text-center min-w-0">
          <h1 className="text-lg md:text-xl font-light italic tracking-wide text-gray-800 dark:text-gray-100 truncate max-w-[40vw] md:max-w-lg mx-auto">
            {businessName}
          </h1>
        </Link>

        {/* Right: controls */}
        <div className="flex items-center justify-end gap-2 w-28">
          <ThemeToggle />
          {session ? (
            <UserButton />
          ) : (
            <LoginButton>
              <Button variant="default" size="sm" className="rounded-lg px-3 text-xs font-medium">
                Iniciar Sesión
              </Button>
            </LoginButton>
          )}
        </div>
      </div>
    </header>
  );
}
