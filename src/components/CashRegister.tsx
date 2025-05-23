"use client";
import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebase/config";
import { MovementAdapter } from "@/models/MovementAdapter";
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
    try {
      const q = query(
        collection(db, "movements"),
        where("paidMethod", "in", ["Deposito", "Retiro", "Efectivo"])
      );

      onSnapshot(q, (snapshot) => {
        const adaptedMoves = MovementAdapter.fromDocumentDataArray(
          snapshot.docs
        );
        setMovements(adaptedMoves);
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

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
