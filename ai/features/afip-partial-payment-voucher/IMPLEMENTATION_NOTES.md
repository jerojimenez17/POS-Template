# Payment voucher implementation notes

The payment voucher flow reuses the repository's existing AFIP preparation and `createVoucher` path with one generic `Pago parcial` line. It does not introduce a tax rate or a separate tax/IVA calculation.

**Fiscal release blocker remains unresolved:** this repository does not contain the remote gateway implementation or documented contract proving that this generic line receives the approved A/B/C IVA treatment and that AFIP's authorized gross total equals the requested amount to the centavo. The implementation accepts a voucher as printable only when the existing gateway's trusted authorized fiscal snapshot reports the exact requested amount. A missing or mismatched trusted total becomes `UNKNOWN` and blocks reissue. Fiscal sign-off is not claimed.

The remote gateway also exposes no authoritative payment-specific reconciliation lookup in this repository. Reconciliation therefore remains unresolved and does not issue another invoice; an operator must obtain authoritative confirmation through the existing support process before any future retry path is enabled.
