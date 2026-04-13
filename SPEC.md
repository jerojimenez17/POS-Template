# SPEC: Add Admin Users Card to RootMenu

## Requirements
- Add a new "Usuarios" card to the main navigation menu (`RootMenu.tsx`).
- The card should link to `/admin/users`.
- The card should use the `Users` icon from `lucide-react`.
- The card MUST only be visible to users with the `ADMIN` role.

## Component Details
### `src/components/ui/RootMenu.tsx`
- Must import `Users` from `lucide-react`.
- Must extract `role` from `session.user`.
- Must conditionally render the new `MenuCard` based on `role === 'ADMIN'`.

## Acceptance Criteria
1. The new "Usuarios" card links to `/admin/users`.
2. The card displays the "Users" icon.
3. The card is only rendered if the authenticated user has the 'ADMIN' role.
4. Users without the 'ADMIN' role (or unauthenticated users) do not see the card.
