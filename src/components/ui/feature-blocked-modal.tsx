"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, MessageCircle, AlertTriangle, Ban } from "lucide-react";

type ModalVariant = "feature" | "limit" | "delinquent";

interface FeatureBlockedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Determines the icon, title, and message */
  variant?: ModalVariant;
  /** Human-readable feature name for "feature" variant (e.g. "Catálogo público") */
  feature?: string;
  /** Resource name for "limit" variant (e.g. "productos", "usuarios") */
  resource?: string;
  /** Limit value for "limit" variant */
  limitValue?: number;
  /** Whether to show the "Entendido" acknowledge button (default: true) */
  showAcknowledge?: boolean;
}

const VARIANTS: Record<
  ModalVariant,
  {
    icon: React.ReactNode;
    title: string;
    getDescription: (props: Pick<FeatureBlockedModalProps, "feature" | "resource" | "limitValue">) => string;
  }
> = {
  feature: {
    icon: (
      <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
        <Lock className="h-7 w-7 text-red-400 dark:text-red-400" />
      </div>
    ),
    title: "Funcionalidad no disponible",
    getDescription: ({ feature }) =>
      feature
        ? `La funcionalidad "${feature}" no está incluida en tu plan actual.`
        : "Esta funcionalidad no está incluida en tu plan actual.",
  },
  limit: {
    icon: (
      <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
        <Ban className="h-7 w-7 text-amber-400 dark:text-amber-400" />
      </div>
    ),
    title: "Límite del plan alcanzado",
    getDescription: ({ resource, limitValue }) =>
      limitValue
        ? `Has superado el límite de ${resource ?? "recursos"} permitido (${limitValue}). Mejorá tu plan para ampliarlo.`
        : `Has superado el límite de ${resource ?? "recursos"} permitido. Mejorá tu plan para ampliarlo.`,
  },
  delinquent: {
    icon: (
      <div className="w-14 h-14 rounded-full bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center">
        <AlertTriangle className="h-7 w-7 text-orange-400 dark:text-orange-400" />
      </div>
    ),
    title: "Cuenta con deuda",
    getDescription: () =>
      "Tu cuenta posee facturas vencidas impagas. Regularizá tu situación para seguir operando.",
  },
};

export const FeatureBlockedModal = ({
  open,
  onOpenChange,
  variant = "feature",
  feature,
  resource,
  limitValue,
  showAcknowledge = false,
}: FeatureBlockedModalProps) => {
  const cfg = VARIANTS[variant];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center text-center py-6 px-2 gap-4">
          {cfg.icon}
          <div>
            <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {cfg.title}
            </DialogTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {cfg.getDescription({ feature, resource, limitValue })}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Contactanos vía WhatsApp para resolverlo.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
            {showAcknowledge && (
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 rounded-lg"
              >
                Entendido
              </Button>
            )}
            <a
              href="https://wa.me/5492265418113"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button className="w-full rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white flex items-center gap-2 justify-center">
                <MessageCircle className="h-4 w-4" />
                Contactar por WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
