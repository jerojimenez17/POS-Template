"use client";

import { useEffect, useState } from "react";
import { getDailyUsage } from "@/lib/daily-limits";
import { getTrialInfo, type TrialInfo } from "@/actions/plan";
import { useSession } from "next-auth/react";
import { Clock, AlertTriangle } from "lucide-react";

interface DailyCounts {
  salesCount: number;
  productsCreated: number;
  clientsCreated: number;
}

export const TrialBanner = () => {
  const { data: session } = useSession();
  const [dailyCounts, setDailyCounts] = useState<DailyCounts | null>(null);
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const businessId = session?.user?.businessId;
    if (!businessId) return;

    (async () => {
      try {
        const info = await getTrialInfo();
        setTrialInfo(info);

        if (info?.isTrial) {
          const usage = await getDailyUsage(businessId);
          setDailyCounts(usage);
        }
      } catch (e) {
        console.error("Error loading trial info:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.businessId]);

  if (loading || !trialInfo?.isTrial) return null;

  const { daysLeft, dailyLimits } = trialInfo;

  return (
    <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white rounded-xl p-4 shadow-lg mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">
              {daysLeft > 0
                ? `Quedan ${daysLeft} días de prueba`
                : "Tu período de prueba ha finalizado"}
            </p>
            {daysLeft <= 5 && daysLeft > 0 && (
              <p className="text-xs text-purple-200 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Contactanos para mantener todas las funcionalidades activas
              </p>
            )}
          </div>
        </div>

        {dailyLimits && dailyCounts && (
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <span className="opacity-80">Ventas hoy: </span>
              <span className="font-bold">
                {dailyCounts.salesCount}/{dailyLimits.sales === 999999 ? "∞" : dailyLimits.sales}
              </span>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <span className="opacity-80">Productos: </span>
              <span className="font-bold">
                {dailyCounts.productsCreated}/{dailyLimits.products === 999999 ? "∞" : dailyLimits.products}
              </span>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <span className="opacity-80">Clientes: </span>
              <span className="font-bold">
                {dailyCounts.clientsCreated}/{dailyLimits.clients === 999999 ? "∞" : dailyLimits.clients}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
