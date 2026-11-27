"use client";
import React, { useEffect, useState } from "react";
import { getBusinessBalanceAction } from "@/actions/billing";
import { Wallet } from "lucide-react";

interface TotalPanelProps {
  refreshCount?: number;
}

const TotalPanel = ({ refreshCount = 0 }: TotalPanelProps) => {
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const balance = await getBusinessBalanceAction();
        setTotal(balance || 0);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    // Fetch immediately when mounted and whenever refreshCount changes
    fetchBalance();
    
  }, [refreshCount]); // Dependency on refreshCount for instant updates

  return (
    <div className="w-full bg-linear-to-r from-blue-600 to-indigo-600 dark:from-blue-900 dark:to-indigo-900 rounded-2xl p-6 md:p-8 shadow-lg text-white mb-6 relative overflow-hidden">
      {/* Decorative background circle */}
      <div className="absolute -right-6 -top-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute right-20 -bottom-10 w-32 h-32 bg-blue-300 opacity-20 rounded-full blur-xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
            <Wallet className="h-8 w-8 text-white" />
          </div>
          <div>
            <p className="text-blue-100 font-medium text-sm md:text-base mb-1">
              Balance en Efectivo Actual
            </p>
            {loading ? (
              <div className="h-10 w-48 bg-white/20 animate-pulse rounded-lg" />
            ) : (
              <p className="text-3xl md:text-5xl font-bold tracking-tight">
                $
                {total.toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TotalPanel;
