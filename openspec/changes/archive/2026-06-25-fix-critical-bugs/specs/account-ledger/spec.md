# Delta for account-ledger

## MODIFIED Requirements

### Requirement: R2 — Ledger shows client debt summary

The account ledger SHALL display a list of clients with outstanding balance (balance > 0), grouped by client instead of listing individual orders. Each client row MUST show: name, total debt, and last activity date. Clicking a client MUST navigate to their detail view.

(Previously: displayed individual orders chronologically)

#### Scenario: L — Clients with debt are listed

- GIVEN there are clients with balance > 0
- WHEN a user navigates to the account ledger
- THEN each client row shows: name, total debt, and last activity
- AND clicking a client navigates to their detail view

#### Scenario: M — No clients with debt

- GIVEN no clients have balance > 0
- WHEN a user navigates to the account ledger
- THEN an empty state is displayed indicating no outstanding debts
