/* eslint-disable @typescript-eslint/no-unused-expressions */
import { DocumentData } from "firebase/firestore";
import { Suplier } from "./Suplier";

export class SuplierFirebaseAdapter {
  public static fromDocumentDataArray(data: DocumentData[]): Suplier[] {
    const state: Suplier[] = [];
    data.forEach((d) => {
      state.push(SuplierFirebaseAdapter.fromDocumentData(d.data(), d.id));
    });
    return state;
  }

  public static fromDocumentData(data: DocumentData, dataId: string): Suplier {
    const suplier = new Suplier();
    suplier.id = dataId;
    data.name ? (suplier.name = data.name) : (suplier.name = "");
    data.bonus ? (suplier.bonus = data.bonus) : (suplier.bonus = 0);
    data.phone ? (suplier.phone = data.phone) : (suplier.phone = "");
    data.creation_date
      ? (suplier.creation_date = data.creation_date)
      : (suplier.creation_date = new Date());
    data.email ? (suplier.email = data.email) : (suplier.email = "");

    console.log(suplier);
    return suplier;
  }
}
