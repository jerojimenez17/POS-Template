"use client";

import { useRouter } from "next/navigation";
import EditableOrderDetail from "@/components/ledger/EditableOrderDetail";

interface OrderItemFromDB {
  id: string;
  productId: string | null;
  description: string | null;
  code: string | null;
  price: number;
  quantity: number;
  subTotal: number;
  addedAt: Date;
}

interface Order {
  id: string;
  total: number;
  paidStatus: string;
  clientId: string | null;
  items: OrderItemFromDB[];
}

interface EditableOrderDetailWrapperProps {
  order: Order;
  businessId: string;
}

export default function EditableOrderDetailWrapper({
  order,
  businessId,
}: EditableOrderDetailWrapperProps) {
  const router = useRouter();

  const handleOrderUpdated = () => {
    router.refresh();
  };

  return (
    <EditableOrderDetail
      order={order}
      businessId={businessId}
      onOrderUpdated={handleOrderUpdated}
    />
  );
}
