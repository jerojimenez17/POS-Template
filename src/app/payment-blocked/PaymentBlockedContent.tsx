"use client";

import { useEffect } from "react";
import { MessageCircle, Lock } from "lucide-react";

const WHATSAPP_URL = "https://wa.me/5492265418113";

export function PaymentBlockedContent() {
  // Prevent browser back button
  useEffect(() => {
    history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      history.pushState(null, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <div className="max-w-md w-full">
      <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 text-center space-y-6 border border-white/10 shadow-2xl">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
          <Lock className="h-10 w-10 text-red-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Cuenta bloqueada</h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Tu cuenta tiene facturas vencidas impagas. Contactanos para
            regularizar tu situación.
          </p>
        </div>

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <button
            type="button"
            className="w-full py-3 px-6 bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold rounded-xl transition-colors flex items-center gap-2 justify-center"
          >
            <MessageCircle className="h-5 w-5" />
            Contactar por WhatsApp
          </button>
        </a>
      </div>
    </div>
  );
}
