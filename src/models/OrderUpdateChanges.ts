export type OrderUpdateChanges =
  | {
      type: "ITEMS_ADDED"
      items: {
        productId: string
        description: string | null
        quantity: number
        price: number
      }[]
    }
  | {
      type: "ITEMS_UPDATED"
      items: {
        productId: string
        description?: string | null
        code?: string | null
        quantity?: { from: number; to: number }
        price?: { from: number; to: number }
      }[]
      removedItems?: {
        productId: string | null
        description: string | null
        code: string | null
        quantity: number
      }[]
      ivaChanged?: {
        from: { condition: string | null; documentNumber: string | null }
        to: { condition: string | null; documentNumber: string | null }
      }
      billTypeChanged?: {
        from: string | null
        to: string | null
      }
      paymentChanged?: {
        from: { method: string | null; twoMethods: boolean; secondMethod: string | null; firstAmount?: number; secondAmount?: number }
        to: { method: string | null; twoMethods: boolean; secondMethod: string | null; firstAmount?: number; secondAmount?: number }
      }
      discountChanged?: {
        from: number
        to: number
      }
      // Stored for future history reads (billType is not on Order model)
      billTypeTo?: string
    }
  | {
      type: "ITEMS_REMOVED"
      items: {
        productId: string
        description: string | null
        code: string | null
      }[]
    }
  | {
      type: "STATUS_CHANGED"
      from: string
      to: string
    }
  | {
      type: "DISCOUNT_CHANGED"
      from: number
      to: number
    }
  | {
      type: "CLIENT_CHANGED"
      from: string | null
      to: string | null
    }
