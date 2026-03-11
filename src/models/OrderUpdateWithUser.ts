import { OrderUpdateType } from "@prisma/client"
import { OrderSnapshot } from "./OrderSnapshot"
import { OrderUpdateChanges } from "./OrderUpdateChanges"


export type OrderUpdateWithUser = {
  id: string
  orderId: string
  version: number
  type: OrderUpdateType
  date: Date

  snapshot: OrderSnapshot | null
  changes: OrderUpdateChanges | null

  updatedBy: {
    name: string | null
    email: string | null
  }
}