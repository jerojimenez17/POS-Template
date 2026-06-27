"use client";

import { cn } from "@/lib/utils";
import { Poppins } from "next/font/google";
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

const font = Poppins({
  subsets: ["latin"],
  weight: ["600"],
});

export function NavigationMenuHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav();
  const businessName = session?.user?.businessName || "Stock.ia";

  // Ocultar el header en el catálogo público
  if (pathname?.includes("/catalogo")) return null;

  return (
    <div
      className={cn(
        "w-full items-center h-12 shadow-md shadow-gray-400 relative flex px-4",
        font.className
      )}
    >
      {/* Left spacer (keeps title centered) */}
      <div className="w-12 md:w-0">
        {session && (
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Center: business name */}
      <Link href="/" className="flex-1 text-center">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-50">{businessName}</h1>
      </Link>

      {/* Right: controls */}
      <div className="flex items-center justify-end gap-x-4 w-12">
        <ThemeToggle />
        {session ? (
          <UserButton />
        ) : (
          <LoginButton>
            <Button variant="default" size="sm">
              Iniciar Sesión
            </Button>
          </LoginButton>
        )}
      </div>
    </div>
  );
}
