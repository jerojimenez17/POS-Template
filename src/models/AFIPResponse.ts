export default interface AFIPResponse {
  afip: {
    CAE: string;
    CAEFchVto: string;
  };
  nroCbte: number;
  ptoVenta: string;
  qrData: string;
}
