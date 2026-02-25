"use client";
import React, { useEffect, useState } from "react";
import { getMovements } from "@/actions/movements";
import { pusherClient } from "@/lib/pusher-client";
import Movement from "@/models/Movement";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TotalPanel from "@/components/TotalPanel";
import EditButton from "@/components/EditButton";
import AddButton from "@/components/AddButton";

import { Session } from "next-auth";

interface props {
  session: Session | null;
}
const CashRegister = ({ session }: props) => {
  const [movements, setMovements] = useState<Movement[]>([]);
  useEffect(() => {
    const fetchMovements = async () => {
      const data = await getMovements();
      // Ensure data conforms to Movement type. Prisma dates might be strings or Date objects depending on serialization.
      // Assuming getMovements returns objects compatible with Movement but check dates.
      // We might need to map them to ensure proper Date objects if passed from server component.
      // Server actions return JSON, so Dates are strings.
      const mappedMovements = data.map(m => ({
        ...m,
        date: new Date(m.date),
        paidMethod: m.paidMethod || "",
        seller: m.seller || ""
      }));
       setMovements(mappedMovements);
    };

    fetchMovements();

    if (session?.user?.businessId) {
      const channel = pusherClient.subscribe(`movements-${session.user.businessId}`);
      
      channel.bind("new-movement", (data: any) => {
             const newMovement = {
                 ...data,
                 date: new Date(data.date),
                 paidMethod: data.paidMethod || "",
                 seller: data.seller || ""
             };
             setMovements((prev) => [newMovement, ...prev]);
      });

      return () => {
        pusherClient.unsubscribe(`movements-${session.user.businessId}`);
      };
    }
  }, [session?.user?.businessId]);

  return (
    <div className="min-h-full flex flex-col bg-slate-50 dark:bg-gray-900 pb-10">
      
      {/* Header Section */}
      <div className="w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Caja Registradora</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestión de ingresos, retiros y visualización de balance diario.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
             <AddButton session={session} />
             <EditButton session={session} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl w-full mx-auto px-6 mt-6 flex flex-col gap-6">
        
        {/* Balance Panel */}
        <TotalPanel />

        {/* Movements Table */}
        <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Historial de Movimientos</h2>
          </div>
          
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                  <TableHead className="font-semibold text-gray-600 dark:text-gray-300">Fecha y Hora</TableHead>
                  <TableHead className="font-semibold text-gray-600 dark:text-gray-300">Usuario</TableHead>
                  <TableHead className="font-semibold text-gray-600 dark:text-gray-300 text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                     <TableCell colSpan={3} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No hay movimientos registrados recientes.
                     </TableCell>
                  </TableRow>
                ) : (
                  movements
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((movement) => {
                      const isNegative = movement.total < 0;
                      return (
                        <TableRow
                          key={movement.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors"
                        >
                          <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="font-medium text-gray-900 dark:text-gray-200 mr-2">
                              {movement.date.toLocaleDateString()}
                            </span>
                            {movement.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {movement.seller?.split('@')[0] || "Sistema"}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              isNegative ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-500"
                            }`}
                          >
                            {isNegative ? "- " : "+ "}
                            $
                            {Math.abs(movement.total).toLocaleString("es-AR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashRegister;
