export default interface CAE {
  CAE: string;
  vencimiento: string;
  nroComprobante: number | string;
  qrData: string;
  ptoVenta?: number | string;
  /** Opaque, one-use server grant; never contains client-supplied tax values. */
  fiscalSnapshotToken?: string;
}
