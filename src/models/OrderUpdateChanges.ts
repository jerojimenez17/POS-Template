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
        quantity?: { from: number; to: number }
        price?: { from: number; to: number }
      }[]
    }
  | {
      type: "ITEMS_REMOVED"
      productIds: string[]
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