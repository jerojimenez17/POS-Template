"use client";

import { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import { toast } from "sonner";
import { Loader2, User, Search, Plus } from "lucide-react";
import { createClient } from "@/actions/clients";
import { getClientUnpaidOrder, addItemsToOrder } from "@/actions/unpaid-orders";

interface Client {
  id: string;
  name: string;
  cellPhone?: string;
  address?: string;
}

interface UnpaidOrderItem {
  productId: string;
  code?: string;
  description?: string;
  costPrice?: number;
  price: number;
  quantity: number;
  subTotal: number;
}

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  subTotal: number;
  addedAt: Date;
}

interface ExistingOrder {
  id: string;
  total: number;
  items: OrderItem[];
}

interface ClientSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Array<{
    id: string;
    code?: string;
    description: string;
    salePrice: number;
    amount: number;
  }>;
  total: number;
  businessId: string;
  onSuccess?: () => void;
}

export default function ClientSelectionModal({
  open,
  onOpenChange,
  items,
  total,
  businessId,
  onSuccess,
}: ClientSelectionModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingClients, setIsFetchingClients] = useState(true);
  
  // Create client modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientCellPhone, setNewClientCellPhone] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  // Smart client selection state (R3)
  const [existingOrder, setExistingOrder] = useState<ExistingOrder | null>(null);
  const [showExistingOrderDialog, setShowExistingOrderDialog] = useState(false);
  const [isCheckingExistingOrder, setIsCheckingExistingOrder] = useState(false);

  useEffect(() => {
    if (open) {
      fetchClients();
      setSelectedClientId("");
      setExistingOrder(null);
      setShowExistingOrderDialog(false);
    }
  }, [open]);

  useEffect(() => {
    const results = clients.filter((client) =>
      client.name.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredClients(results);
  }, [search, clients]);

  const fetchClients = async () => {
    setIsFetchingClients(true);
    try {
      const response = await fetch("/api/clients");
      const data = await response.json();
      setClients(data.clients || data);
      setFilteredClients(data.clients || data);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setIsFetchingClients(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    setIsCreatingClient(true);
    try {
      const result = await createClient({
        name: newClientName.trim(),
        cellPhone: newClientCellPhone.trim() || undefined,
        address: newClientAddress.trim() || undefined,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.success || "Cliente creado correctamente");
        setIsCreateModalOpen(false);
        setNewClientName("");
        setNewClientCellPhone("");
        setNewClientAddress("");
        await fetchClients();
        if (result.client) {
          setSelectedClientId(result.client.id);
        }
      }
    } catch (error) {
      console.error("Error creating client:", error);
      toast.error("Error al crear el cliente");
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedClientId) {
      toast.error("Por favor seleccione un cliente");
      return;
    }

    setIsCheckingExistingOrder(true);
    try {
      const result = await getClientUnpaidOrder(selectedClientId, businessId);
      
      if (result.success && result.data) {
        setExistingOrder(result.data as ExistingOrder);
        setShowExistingOrderDialog(true);
        setIsCheckingExistingOrder(false);
        return;
      }

      await createNewOrder(selectedClientId);
    } catch (error) {
      console.error("Error checking existing order:", error);
      await createNewOrder(selectedClientId);
    } finally {
      setIsCheckingExistingOrder(false);
    }
  };

  const createNewOrder = async (clientId: string) => {
    setIsLoading(true);
    try {
      const orderItems: UnpaidOrderItem[] = items.map((item) => ({
        productId: item.id,
        code: item.code,
        description: item.description,
        price: item.salePrice,
        quantity: item.amount,
        subTotal: item.salePrice * item.amount,
      }));

      const response = await fetch("/api/unpaid-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          businessId,
          items: orderItems,
          total,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Orden a cuenta creada correctamente");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error || "Error al crear la orden");
      }
    } catch (error) {
      console.error("Error creating unpaid order:", error);
      toast.error("Error al crear la orden");
    } finally {
      setIsLoading(false);
    }
  };

  const addToExistingOrder = async () => {
    if (!existingOrder) return;

    setIsLoading(true);
    try {
      const orderItems: UnpaidOrderItem[] = items.map((item) => ({
        productId: item.id,
        code: item.code,
        description: item.description,
        price: item.salePrice,
        quantity: item.amount,
        subTotal: item.salePrice * item.amount,
      }));

      const result = await addItemsToOrder({
        orderId: existingOrder.id,
        businessId,
        items: orderItems,
      });

      if (result.success) {
        toast.success("Items agregados a la orden existente");
        setShowExistingOrderDialog(false);
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error || "Error al agregar items a la orden");
      }
    } catch (error) {
      console.error("Error adding to existing order:", error);
      toast.error("Error al agregar items a la orden");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Orden a Cuenta</DialogTitle>
          <DialogDescription>
            Seleccione un cliente para crear la orden a cuenta
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsCreateModalOpen(true)}
              title="Crear nuevo cliente"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[300px] overflow-y-auto border rounded-lg">
            {isFetchingClients ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron clientes
              </div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  className={`p-3 cursor-pointer border-b last:border-b-0 transition-colors ${
                    selectedClientId === client.id
                      ? "bg-primary/10"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{client.name}</span>
                  </div>
                  {client.cellPhone && (
                    <p className="text-sm text-muted-foreground ml-6">
                      {client.cellPhone}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Total:</span>
            <span className="text-lg font-bold">
              ${total.toLocaleString("es-AR")}
            </span>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isLoading}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={isLoading || !selectedClientId || isCheckingExistingOrder}>
            {isLoading || isCheckingExistingOrder ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Create Client Modal */}
    <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Cliente</DialogTitle>
          <DialogDescription>
            Ingrese los datos del nuevo cliente
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="clientName">
              Nombre completo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="clientName"
              placeholder="Juan Perez"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="clientCellPhone">Teléfono</Label>
            <Input
              id="clientCellPhone"
              placeholder="341 123 4567"
              value={newClientCellPhone}
              onChange={(e) => setNewClientCellPhone(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="clientAddress">Dirección</Label>
            <Input
              id="clientAddress"
              placeholder="Calle 123, Ciudad"
              value={newClientAddress}
              onChange={(e) => setNewClientAddress(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isCreatingClient}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={handleCreateClient} disabled={isCreatingClient || !newClientName.trim()}>
            {isCreatingClient ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Crear Cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Existing Order Dialog (R3: Smart Client Selection) */}
    <Dialog open={showExistingOrderDialog} onOpenChange={setShowExistingOrderDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Orden Pendiente Existente</DialogTitle>
          <DialogDescription>
            Este cliente ya tiene una orden pendiente
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Orden actual:</p>
            <p className="text-lg font-bold">
              ${existingOrder?.total.toLocaleString("es-AR") || "0"}
            </p>
          </div>
          
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Total a agregar:</p>
            <p className="text-lg font-bold">
              ${total.toLocaleString("es-AR")}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            ¿Qué desea hacer con los productos seleccionados?
          </p>
        </div>

        <DialogFooter className="flex-col gap-2">
          <Button 
            onClick={addToExistingOrder} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Agregar a orden existente
          </Button>
          <Button 
            variant="outline"
            onClick={() => {
              setShowExistingOrderDialog(false);
              createNewOrder(selectedClientId);
            }}
            disabled={isLoading}
            className="w-full"
          >
            Crear nueva orden
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" disabled={isLoading} className="w-full">
              Cancelar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
