import type { Metadata } from "next";
import { PaymentBlockedContent } from "./PaymentBlockedContent";

export const metadata: Metadata = {
  title: "Cuenta bloqueada",
  robots: "noindex",
};

export default function PaymentBlockedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <PaymentBlockedContent />
    </div>
  );
}
