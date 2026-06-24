"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMobileNav } from "@/context/MobileNavContext";
import {
  FileText,
  Package,
  BookOpen,
  Calculator,
  BarChart3,
  LayoutGrid,
  Users,
  Box,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Facturar", href: "/newBill", icon: <FileText className="h-5 w-5" /> },
  { label: "Stock", href: "/stock/productDashboard", icon: <Package className="h-5 w-5" /> },
  { label: "Fichero", href: "/account-ledger", icon: <BookOpen className="h-5 w-5" /> },
  { label: "Caja", href: "/cashRegister", icon: <Calculator className="h-5 w-5" /> },
  { label: "Reportes", href: "/report", icon: <BarChart3 className="h-5 w-5" /> },
  { label: "Catálogo", href: "#", icon: <LayoutGrid className="h-5 w-5" /> },
  { label: "Usuarios", href: "/admin/users", icon: <Users className="h-5 w-5" />, adminOnly: true },
  { label: "Cajas", href: "/admin/cashboxes", icon: <Box className="h-5 w-5" />, adminOnly: true },
  { label: "Config.", href: "/admin/settings", icon: <Settings className="h-5 w-5" />, adminOnly: true },
];

const SideNav = () => {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const businessSlug = session?.user?.businessSlug;
  const isAdmin = role === "ADMIN";
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav();

  const isActive = (href: string) => {
    if (href === "#") return false;
    return pathname.startsWith(href);
  };

  const resolvedItems = navItems.map((item) => ({
    ...item,
    href: item.label === "Catálogo" && businessSlug ? `/${businessSlug}/catalogo` : item.href,
    hidden: item.adminOnly ? !isAdmin : false,
  }));

  const visibleItems = resolvedItems.filter((item) => !item.hidden);

  const NavLink = ({ item, active, onClick }: { item: typeof visibleItems[0]; active: boolean; onClick?: () => void }) => (
    <Link
      key={item.label}
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap overflow-hidden",
        active
          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
      )}
      title={item.label}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
        {item.label}
      </span>
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="fixed left-0 top-12 h-[calc(100vh-3rem)] z-40 hidden md:flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-200 w-14 hover:w-48 group/sidebar">
        <div className="flex flex-col gap-1 p-2 pt-4 overflow-hidden">
          {visibleItems.map((item) => (
            <NavLink key={item.label} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-2xl transform transition-transform duration-300 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <span className="font-bold text-gray-800 dark:text-gray-200">Navegación</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-1 p-3">
          {visibleItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
};

export default SideNav;
