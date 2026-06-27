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
      ivaChanged?: {
        from: { condition: string | null; documentNumber: string | null }
        to: { condition: string | null; documentNumber: string | null }
      }
      billTypeChanged?: {
        from: string | null
        to: string | null
      }
      paymentChanged?: {
        from: { method: string | null; twoMethods: boolean; secondMethod: string | null }
        to: { method: string | null; twoMethods: boolean; secondMethod: string | null }
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
