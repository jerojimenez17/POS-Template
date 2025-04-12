import BillState from "@/models/BillState";
import axios from "axios";

const postBill = async (billState: BillState) => {
  console.log(billState);
  try {
    const AFIPResponse = await axios.post(
      "https://createafipvoucher-ktbsssofoba-uc.a.run.app",
      {
        billState: billState,
      }
    );
    return AFIPResponse.data;
  } catch (err) {
    console.error(err);
  }
};
export default postBill;
