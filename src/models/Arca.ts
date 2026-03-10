import { IvaCondition } from "@prisma/client";

export interface ArcaData {
  cuit: string | null;
  razonSocial: string | null;
  inicioActividades: Date | null;
  condicionIva: IvaCondition;
  cert: string | null;
  key: string | null;
}

export interface ArcaUpdateInput {
  cuit?: string;
  razonSocial?: string;
  inicioActividades?: Date;
  condicionIva?: IvaCondition;
  cert?: string;
  key?: string;
}
