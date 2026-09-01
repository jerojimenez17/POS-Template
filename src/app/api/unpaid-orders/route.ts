import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createUnpaidOrder, getClientUnpaidOrders } from "@/actions/unpaid-orders";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.businessId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
    }

    const result = await getClientUnpaidOrders(clientId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ orders: result.data ?? [] });
  } catch (error) {
    console.error("Error fetching client unpaid orders:", error);
    return NextResponse.json({ error: "Error al obtener las órdenes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.businessId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, items, total, discount, seller, clientIvaCondition, clientDocumentNumber, notes } = body;

    if (!clientId || !items || !total) {
      return NextResponse.json(
        { error: "Faltan datos requeridos" },
        { status: 400 }
      );
    }

    const result = await createUnpaidOrder({
      clientId,
      businessId: session.user.businessId,
      items,
      total,
      discount,
      seller,
      clientIvaCondition,
      clientDocumentNumber,
      notes,
    });

    if (result.success && 'data' in result) {
      return NextResponse.json({ success: true, data: result.data });
    } else {
      const errorMsg = 'error' in result ? result.error : "Error desconocido";
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error creating unpaid order:", error);
    return NextResponse.json(
      { error: "Error al crear la orden" },
      { status: 500 }
    );
  }
}
