"use client";
import React, { useEffect, useState } from "react";
import { getBusinessBalanceAction } from "@/actions/billing";

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
    <div className="w-full max-w-sm my-6 mx-auto bg-linear-to-br from-blue-50 to-white dark:from-gray-800 dark:to-gray-900 border border-blue-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center transition-all hover:shadow-md">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
        Balance en Efectivo Actual
      </p>
      {loading ? (
        <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-md" />
      ) : (
        <p className="text-4xl font-bold text-blue-600 dark:text-blue-400 font-mono tracking-tight">
          $
          {total.toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      )}
    </div>
  );
};

export default TotalPanel;
