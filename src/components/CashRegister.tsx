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
    <div className="my-auto h-full flex flex-col bg-white text-center items-center justify-center w-full">
      <div>
        <h2 className="text-2xl font-mono font-semibold text-gray-800">Caja</h2>
      </div>
      <TotalPanel />
      <div className="backdrop-blur-sm w-full h-20 flex justify-center gap-2 items-center">
        <EditButton session={session} />
        <AddButton session={session} />
      </div>
      <div className="text-slate-900 bg-white h-full flex flex-wrap pb-9 px-4 my-auto w-full overflow-auto">
        <Table className="items-center">
          <TableHeader>
            <TableRow className="items-center">
              <TableHead className="text-center">Fecha</TableHead>
              <TableHead className="text-center">Usuario</TableHead>
              <TableHead className="text-center">Movimiento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="items-center">
            {movements
              .sort((a, b) => {
                const timeA = new Date(a.date).getTime();
                const timeB = new Date(b.date).getTime();

                return timeB - timeA; // Ordena de más reciente a más antiguo
              })
              .map((movement) => {
                return (
                  <TableRow
                    className={`${movement.total < 0 && "text-red-700"}`}
                    key={movement.id}
                  >
                    <TableCell>
                      {movement.date.toLocaleDateString() +
                        " " +
                        movement.date.toLocaleTimeString()}
                    </TableCell>
                    <TableCell>{movement.seller}</TableCell>
                    <TableCell
                      className={`${movement.total < 0 && "text-red-700"}`}
                    >
                      $
                      {movement.total.toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CashRegister;
