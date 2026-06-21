"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";


interface MenuCardProps {
  url: string;
  title: string;
  children?: React.ReactNode;
}

export default function MenuCard({ url, title, children }: MenuCardProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = () => {
    if (loading) return;

    setLoading(true);
    router.push(url);
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`
        bg-white dark:bg-gray-800
        rounded-2xl p-6 flex flex-col items-center justify-center
        shadow-sm border border-gray-100 dark:border-gray-700
        transition-all duration-200 ease-in-out select-none min-h-[140px]
        ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:scale-[1.02] hover:shadow-[0px_8px_25px_rgba(0,0,0,0.15)] hover:border-blue-300 dark:hover:border-blue-600 active:scale-[0.98]"}
      `}
    >
      <div className="text-gray-600 dark:text-gray-300 mb-3">
        {children}
      </div>

      <p className="text-center font-semibold text-gray-700 dark:text-gray-200 text-sm">{title}</p>

      {loading && (
        <p className="text-xs mt-2 animate-pulse text-gray-500">Cargando...</p>
      )}
    </button>
  );
}
