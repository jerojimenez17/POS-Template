import { IvaCondition } from "@prisma/client";

export interface ArcaData {
  cuit: string | null;
  razonSocial: string | null;
  inicioActividades: Date | null;
  condicionIva: IvaCondition;
  /** Presence only; certificate material never crosses the server boundary. */
  cert: "CONFIGURADO" | null;
  /** Presence only; private key material never crosses the server boundary. */
  key: "CONFIGURADO" | null;
  ptoVenta: number[];
}

export interface ArcaUpdateInput {
  cuit?: string;
  razonSocial?: string;
  inicioActividades?: Date;
  condicionIva?: IvaCondition;
  cert?: string;
  key?: string;
  ptoVenta?: number[];
}
