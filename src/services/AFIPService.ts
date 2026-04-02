import BillState from "@/models/BillState";
import axios from "axios";

const postBill = async (data: {
  action: string;
  cuit: string;
  encryptedCert: string;
  encryptedKey: string;
  billState: BillState;
}) => {
  console.log(data.billState);
  try {
    const AFIPResponse = await axios.post(
      process.env.AFIP_FUNCTION_URL || "http://127.0.0.1:5001/stockia-e90c6/us-central1/createAFIPVoucher" ,
      data
    );
    return AFIPResponse.data;
  } catch (err) {
    console.error(err);
  }
};
export default postBill;
