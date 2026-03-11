export type OrderSnapshot = {
  id: string
  total: number
  status: "pendiente" | "confirmado" | "entregado" | "consignacion"
  paidStatus: "pago" | "inpago"

  discountAmount: number
  discountPercentage: number

  clientId: string | null

  items: {
    productId: string | null
    code: string | null
    description: string | null
    quantity: number
    price: number
    subTotal: number
  }[]
}