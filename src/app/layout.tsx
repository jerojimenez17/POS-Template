import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { NavigationMenuHeader } from "@/components/ui/NavBar";
import FiltersProvider from "@/context/FiltersContext/FiltersProivder";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

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
  title: "Tu app",
  description: "A template for Point of Sales Apps",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
          <body
            className={`${geistSans.variable} ${geistMono.variable} ${poppins.className} antialiased h-screen w-screen overflow-auto`}
            >
            <ThemeProvider>
              <FiltersProvider>
                <div className="h-full w-full  bg-slate-100 dark:bg-gray-800">
            <NavigationMenuHeader />
            {children}
                </div>
        </FiltersProvider>
      </ThemeProvider>
          </body>
    </html>
  );
}
