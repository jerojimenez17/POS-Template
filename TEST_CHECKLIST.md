# TEST CHECKLIST: Admin Users Card

## Acceptance Criteria
- [x] UI renders base cards correctly for any user.
- [x] Users card is NOT rendered when `session.user.role` is 'USER'.
- [x] Users card IS rendered when `session.user.role` is 'ADMIN'.
- [x] Users card has the correct URL `/admin/users`.
- [x] Users card has the `Users` icon from `lucide-react`.

## Expected Behaviors
- Unauthenticated users handled gracefully (no crash, default components shown).
- Users card visibility toggles based purely on the `role` attribute.
