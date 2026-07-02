"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { MessageCircle, AlertTriangle } from "lucide-react";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { useDelinquentStore } from "@/stores/useDelinquentStore";
import { getBusinessStatusAction } from "@/actions/business";

const POLL_INTERVAL = 30_000; // 30 seconds
const WHATSAPP_URL = "https://wa.me/5492265418113";

export const OverduePaymentBlocker = () => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const { isDelinquent, setDelinquent } = useDelinquentStore();

  // Sync session state on mount (only once)
  useEffect(() => {
    if (session?.user?.business?.accountStatus === "MOROSO") {
      setDelinquent(true);
    }
  }, [session, setDelinquent]);

  // MutationObserver — DevTools evasion (only active when delinquent)
  useEffect(() => {
    if (!isDelinquent) return;

    const node = overlayRef.current;
    if (!node) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (
            removedNode === node ||
            (removedNode instanceof Node && node.contains(removedNode))
          ) {
            window.location.href = "/payment-blocked";
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isDelinquent]);

  // Polling — check status every 30s (only active when delinquent)
  useEffect(() => {
    if (!isDelinquent) return;

    const poll = async () => {
      try {
        const result = await getBusinessStatusAction();
        if (result?.status === "ACTIVO") {
          setDelinquent(false);
        }
      } catch {
        // Network errors are ignored — next poll will retry in 30s
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalId);
  }, [isDelinquent, setDelinquent]);

  // Escape key prevention
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
      }
    },
    []
  );

  if (!isDelinquent) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[99999] pointer-events-none bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      <FocusScope asChild trapped loop>
        <div
          className="pointer-events-auto max-w-md w-full"
          role="alertdialog"
          aria-modal="true"
          aria-label="Cuenta con deuda"
        >
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 text-center space-y-6 border border-white/10 shadow-2xl">
            <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="h-10 w-10 text-orange-400" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">
                Cuenta con deuda
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Tu cuenta posee facturas vencidas impagas. Contactanos para
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
      </FocusScope>
    </div>
  );
};
