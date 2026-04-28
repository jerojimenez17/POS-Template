# SPEC: Multiple Cashboxes and Sessions

## Objective
Update the architecture to support multiple cashboxes per business. Admins can create cashboxes and assign them to users. Users must open a cashbox session before creating a new bill, and can close the session at the end of their shift to generate a Z-Report.

## Acceptance Criteria
1. **Data Models**:
   - `CashBox` model is updated to remove `businessId` uniqueness and include a `name` field.
   - `User` model is updated to include `cashboxId`.
   - A new `CashboxSession` model is created to track active sessions (with fields: `userId`, `cashboxId`, `initialBalance`, `finalBalance`, `startTime`, `endTime`, `status`, `zReport`).
   - `Order` and `CashMovement` models are updated to reference `cashboxSessionId`.
2. **Admin Management**:
   - Admin can view, create, and edit cashboxes for their business.
   - Admin can assign a cashbox to a user in the User Management page.
3. **User Flow (Session Management)**:
   - When a user visits `/newBill`, if they don't have an open `CashboxSession`, a modal prompts them to open one, requiring an initial balance.
   - Users cannot create sales if they don't have an active session.
   - When processing a sale, the `Order` and `CashMovement` are linked to the active `CashboxSession`.
   - User can close their session. This calculates totals (sales, discounts, payment methods), saves the Z-Report as JSON on the session, and sets status to CLOSED.
4. **Z-Report**:
   - The UI displays the Z-Report after closing a session, detailing totals and payment methods.

## Technical Details

### Prisma Schema Changes
```prisma
model CashBox {
  id         String   @id @default(cuid())
  name       String   @default("Caja Principal") // Added
  total      Float    @default(0)
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  updatedAt  DateTime @updatedAt

  users      User[]
  sessions   CashboxSession[]
  
  // Removed @@unique([businessId]) - now we can have multiple
}

model User {
  // ... existing fields
  cashboxId  String?
  cashbox    CashBox? @relation(fields: [cashboxId], references: [id])
  sessions   CashboxSession[]
}

model CashboxSession {
  id             String    @id @default(cuid())
  cashboxId      String
  cashbox        CashBox   @relation(fields: [cashboxId], references: [id])
  userId         String
  user           User      @relation(fields: [userId], references: [id])
  businessId     String
  business       Business  @relation(fields: [businessId], references: [id])
  
  startTime      DateTime  @default(now())
  endTime        DateTime?
  initialBalance Float     @default(0)
  finalBalance   Float?
  status         SessionStatus @default(OPEN)
  
  zReport        Json?
  
  orders         Order[]
  cashMovements  CashMovement[]

  @@index([businessId, startTime])
}

enum SessionStatus {
  OPEN
  CLOSED
}

// In Order:
// cashboxSessionId String?
// cashboxSession   CashboxSession? @relation(fields: [cashboxSessionId], references: [id])

// In CashMovement:
// cashboxSessionId String?
// cashboxSession   CashboxSession? @relation(fields: [cashboxSessionId], references: [id])
```

### Affected Files
- `prisma/schema.prisma`
- `src/actions/sales.ts` (link sales to active session)
- `src/actions/cashbox.ts` (new actions for opening/closing sessions, creating cashboxes)
- `src/app/(protected)/newBill/page.tsx` (add session check modal)
- `src/components/actions/users.ts` (handle assigning cashbox)
- `src/app/(protected)/admin/users/page.tsx` (UI to assign cashbox)
- (New) `/src/app/(protected)/cashboxes/...` (admin cashbox management UI)

## Migration Strategy
1. Add `name` to `CashBox` with a default value.
2. Remove `@unique` from `businessId` in `CashBox`.
3. Add `CashboxSession`, `SessionStatus`, and foreign keys.
4. Run `npx prisma db push`.
