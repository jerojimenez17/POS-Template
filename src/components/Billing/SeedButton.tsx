"use client";

import { useState } from "react";
import { toast } from "sonner";
import { seedDebtsFromExcel } from "@/actions/seed-debts";

export default function SeedButton() {
  const [loading, setLoading] = useState(false);

  const handleSeed = async () => {
    if (!confirm("¿Estás seguro que quieres importar las deudas desde el Excel? Esto creará clientes y órdenes impagas.")) {
      return;
    }

    setLoading(true);
    try {
      const result = await seedDebtsFromExcel();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error || "Ocurrió un error al importar las deudas.");
      }
    } catch {
      toast.error("Ocurrió un error inesperado al importar las deudas.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSeed}
      disabled={loading}
      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
    >
      {loading ? "Importando..." : "Importar Deudas (Temporal)"}
    </button>
  );
}
