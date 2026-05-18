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
};

import { Toaster } from "react-hot-toast";

import { AuthProvider } from "@/components/auth/SessionProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <meta name="color-scheme" content="dark light" />
        <link rel="icon" type="image/png" href="/LOGO.png" />
      </head>
          <body
            className={`${geistSans.variable} ${geistMono.variable} ${poppins.className} antialiased min-h-screen overflow-x-hidden`}
            >
            <AuthProvider>
            <CashboxProvider>
            <ThemeProvider>
              <FiltersProvider>
                <div className="min-h-screen bg-slate-100 dark:bg-gray-800">
            <NavigationMenuHeader />
            <PaymentStatusGuard />
            {children}
            <Toaster position="bottom-right" />
                </div>
        </FiltersProvider>
      </ThemeProvider>
            </CashboxProvider>
            </AuthProvider>
          </body>
    </html>
  );
}
