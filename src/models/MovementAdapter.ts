/* eslint-disable @typescript-eslint/no-unused-expressions */
import { DocumentData, Timestamp } from "firebase/firestore";
import Movement from "./Movement";

export class MovementAdapter {
  public static fromDocumentDataArray(data: DocumentData[]): Movement[] {
    const state: Movement[] = [];
    data.forEach((d) => {
      state.push({
        ...MovementAdapter.fromDocumentData(d.data(), d.id),
      });
    });
    console.log(state);
    return state;
  }
  public static fromDocumentData(data: DocumentData, dataId: string): Movement {
    const moveAdapted = new Movement();
    moveAdapted.id = dataId;
    data.total ? (moveAdapted.total = data.total) : (moveAdapted.total = 0);
    data.seller
      ? (moveAdapted.seller = data.seller)
      : (moveAdapted.seller = "");
    data.paidMethod ? moveAdapted.paidMethod : (moveAdapted.paidMethod = "");
    moveAdapted.date =
      data.date instanceof Timestamp ? data.date.toDate() : new Date();

    return moveAdapted;
  }
}
