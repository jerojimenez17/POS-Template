"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownRight, ArrowUpRight, PackageOpen } from "lucide-react";

export interface StockActivityItem {
  productId: string;
  code: string;
  description: string;
  quantity: number;
}

interface StockActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  ins: StockActivityItem[];
  outs: StockActivityItem[];
}

const StockActivityModal: React.FC<StockActivityModalProps> = ({ isOpen, onClose, ins, outs }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageOpen className="w-5 h-5 text-blue-600" />
            Detalle de Actividad de Stock
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="outs" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="outs" className="flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-red-500" />
              Egresos ({outs.reduce((acc, item) => acc + item.quantity, 0)})
            </TabsTrigger>
            <TabsTrigger value="ins" className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-green-500" />
              Reincorporaciones ({ins.reduce((acc, item) => acc + item.quantity, 0)})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outs" className="mt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                        No hay egresos registrados en este período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    outs.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell className="font-mono text-xs">{item.code || "-"}</TableCell>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell className="text-right text-red-600 font-bold">
                          -{item.quantity}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="ins" className="mt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                        No hay reincorporaciones registradas en este período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ins.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell className="font-mono text-xs">{item.code || "-"}</TableCell>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell className="text-right text-green-600 font-bold">
                          +{item.quantity}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default StockActivityModal;
