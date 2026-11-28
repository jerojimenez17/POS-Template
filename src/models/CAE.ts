export default interface CAE {
  CAE: string;
  vencimiento: string;
  nroComprobante: number | string;
  qrData: string;
  /** Historical compatibility only; never accepted as proof for new sales. */
  requestDate?: string;
  /** Historical compatibility only; new print URLs are resolved server-side. */
  qrUrl?: string;
  ptoVenta?: number | string;
  /** Opaque one-use QR attestation token, accepted only by the save action. */
  qrAttestationToken?: string;
  /** Internal DB reference used by server-side print resolution. */
  qrAttestationId?: string;
  /** Opaque, one-use server grant; never contains client-supplied tax values. */
  fiscalSnapshotToken?: string;
}
