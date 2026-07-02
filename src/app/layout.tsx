import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { NavigationMenuHeader } from "@/components/ui/NavBar";
import FiltersProvider from "@/context/FiltersContext/FiltersProivder";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { PaymentStatusGuard } from "@/components/PaymentStatusGuard";
import { CashboxProvider } from "@/context/CashboxContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins-sans",
  subsets: ["latin"],
  weight: "400",
});
export const metadata: Metadata = {
  title: "Stock.ia",
  description: "A SaaS for Point of Sales",
  other: {
    "theme-color": "#0f172a",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

import { Toaster } from "sonner";

import { AuthProvider } from "@/components/auth/SessionProvider";
import { WebVitals } from "@/components/WebVitals";
import { MobileNavProvider } from "@/context/MobileNavContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <meta name="color-scheme" content="dark light" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        <link rel="icon" type="image/png" href="/LOGO.png" />
      </head>
          <body
            className={`${geistSans.variable} ${geistMono.variable} ${poppins.className} antialiased min-h-screen overflow-x-hidden`}
            >
            <AuthProvider>
            <MobileNavProvider>
            <CashboxProvider>
            <ThemeProvider>
              <FiltersProvider>
                <div className="min-h-screen bg-slate-100 dark:bg-gray-800 flex flex-col">
            <NavigationMenuHeader />
            <PaymentStatusGuard />
            <div className="flex-1">
              {children}
            </div>
            <footer className="py-4 px-4 border-t border-gray-200/40 dark:border-gray-800/40">
              <p className="text-center text-xs font-light tracking-wider text-gray-400 dark:text-gray-600">
                &copy; {new Date().getFullYear()} Stok.ia
              </p>
            </footer>
            <WebVitals />
            <Toaster position="bottom-right" richColors />
                </div>
        </FiltersProvider>
      </ThemeProvider>
            </CashboxProvider>
            </MobileNavProvider>
            </AuthProvider>
          </body>
    </html>
  );
}
