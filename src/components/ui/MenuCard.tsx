"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

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
    <motion.button
      onClick={handleClick}
      disabled={loading}
      whileHover={{ scale: 1.02, boxShadow: "0px 8px 25px rgba(0,0,0,0.15)" }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={`
        bg-white dark:bg-gray-800
        rounded-2xl p-6 flex flex-col items-center justify-center
        shadow-sm border border-gray-100 dark:border-gray-700
        transition-all select-none min-h-[140px]
        ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-blue-300 dark:hover:border-blue-600"}
      `}
    >
      <div className="text-gray-600 dark:text-gray-300 mb-3">
        {children}
      </div>

      <p className="text-center font-semibold text-gray-700 dark:text-gray-200 text-sm">{title}</p>

      {loading && (
        <p className="text-xs mt-2 animate-pulse text-gray-500">Cargando...</p>
      )}
    </motion.button>
  );
}
