# TEST CHECKLIST: Multiple Cashboxes & Sessions

## Acceptance Criteria
- [ ] `CashBox` can have multiple instances per `Business` (unique constraint removed)
- [ ] `CashBox` has a `name` field
- [ ] `User` can be assigned a `CashBox`
- [ ] `CashboxSession` tracks active shifts (start, end, balances, status)
- [ ] `Order` and `CashMovement` are linked to a `CashboxSession`

## Scenarios

### Cashbox Sessions
- [ ] **Positive:** User can open a session with an initial balance
- [ ] **Positive:** User can close a session and a Z-Report is generated
- [ ] **Positive:** User logs out, active session is automatically closed
- [ ] **Negative:** User cannot process a sale without an active session
- [ ] **Edge Case:** Attempting to open a session when one is already open throws an error

### Cashbox Management (Admin)
- [ ] **Positive:** Admin can create a new Cashbox
- [ ] **Positive:** Admin can assign a Cashbox to a User
- [ ] **Negative:** User cannot create a Cashbox (Admin only)
