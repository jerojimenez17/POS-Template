"use client";

import { useEffect, useState } from "react";
import { getBusinessStatusAction } from "@/actions/business";
import { toast } from "react-hot-toast";
import { AlertTriangle, Lock } from "lucide-react";

export const PaymentStatusGuard = () => {
  const [status, setStatus] = useState<{
    message: string | null;
    type: "error" | "warning" | "info";
    shouldBlock: boolean;
  } | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      const res = await getBusinessStatusAction();
      if (res && res.message) {
        setStatus(res);
        if (res.type === "error") {
            toast.error(res.message, { id: "payment-error", duration: Infinity });
        } else if (res.type === "warning") {
            toast.error(res.message, { id: "payment-warning", icon: <AlertTriangle className="text-orange-500" /> });
        } else {
            toast(res.message, { id: "payment-info" });
        }
      }
    };
    checkStatus();
  }, []);

  if (status?.shouldBlock) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 max-w-md w-full rounded-2xl shadow-2xl p-8 text-center space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="h-20 w-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto text-red-600">
            <Lock className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Acceso Restringido</h2>
            <p className="text-slate-600 dark:text-slate-400">
              {status.message}
            </p>
          </div>
          <div className="pt-4">
            <a 
              href="mailto:soporte@tuapp.com" 
              className="inline-block w-full py-3 px-6 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-semibold transition-colors"
            >
              Contactar Soporte
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
