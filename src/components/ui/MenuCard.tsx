"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function MenuCard({ url, title, children }: { url: string; title: string; children: React.ReactNode }) {
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
      disabled={loading}  whileHover={{ scale: 1.1, y: -2, boxShadow: "0px 4px 10px rgba(0,0,0,0.35)" }}
  whileTap={{ scale: 1.5}}
  transition={{ duration: 0.08 }}
      className={`
        bg-slate-300 dark:bg-gray-800
       rounded-xl p-4 flex flex-col items-center shadow-md
        transition-all select-none 
        ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <div className="w-full flex justify-center mb-2">
        {children}
      </div>

      <p className="text-center font-semibold text-gray-800 dark:text-gray-200">{title}</p>

      {loading && (
        <p className="text-xs mt-2 animate-pulse">Cargando...</p>
      )}
    </motion.button>
  );
}
