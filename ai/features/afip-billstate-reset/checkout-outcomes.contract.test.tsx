/**
 * Contract matrix for the checkout component.
 *
 * These cases intentionally remain pending until the reset/PrintJob seam is
 * exposed by BillButtons/ProductsTable. Keeping them here makes the required
 * observable behavior explicit without coupling the test to a guessed private
 * API or to arbitrary five-second delays.
 */
import { describe, it } from "vitest";

describe("BillButtons checkout outcome contract", () => {
  it.todo("Factura AFIP: valid CAE + save creates one print job and one reset");
  it.todo("Factura AFIP: AFIP rejection, exception, invalid/missing CAE never resets");
  it.todo("Factura AFIP: save failure never resets and leaves the checkout visible");
  it.todo("Factura AFIP: a pending reset cannot clear a newer sale");
  it.todo("Factura AFIP: thermal and PDF printing consume the pre-reset snapshot");
  it.todo("Remito keeps its non-AFIP print and safe reset behavior");
  it.todo("Presupuesto prints as Presupuesto and next checkout uses business default");
  it.todo("A cuenta saves and resets once without AFIP or printing");
  it.todo("Cancelling Factura, Remito, Presupuesto or A cuenta does nothing");
});
