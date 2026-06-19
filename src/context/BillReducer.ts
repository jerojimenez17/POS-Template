import BillState from "@/models/BillState";
import Product from "@/models/Product";
import type { BillAction } from "./billActions";

export const BillReducer = (
  state: BillState,
  action: BillAction
): BillState => {
  switch (action.type) {
    case "addItem": {
      const isPresent = state.products.find(
        (product) => product.id === action.payload.id
      );
      let updatedProducts;
      if (isPresent) {
        updatedProducts = state.products.map((product) => {
          if (product.id === action.payload.id) {
            return { ...product, amount: product.amount + action.payload.amount };
          }
          return product;
        });
      } else {
        updatedProducts = state.products.concat({ ...action.payload });
      }
      const rawTotal = updatedProducts.reduce(
        (acc, cur) => acc + cur.salePrice * cur.amount, 0
      );
      const newTotal = Math.round(rawTotal);
      const newTotalWithDiscount = state.discount > 0
        ? Math.round(rawTotal * (1 - state.discount / 100))
        : newTotal;
      return {
        ...state,
        products: updatedProducts,
        total: newTotal,
        totalWithDiscount: newTotalWithDiscount,
      };
    }
    case "addUnit": {
      const updatedProducts = state.products.map((product) => {
        if (product.id === action.payload.id) {
          return { ...product, amount: product.amount + 1 };
        }
        return product;
      });
      const rawTotal = updatedProducts.reduce(
        (acc, cur) => acc + cur.salePrice * cur.amount, 0
      );
      const newTotal = Math.round(rawTotal);
      const newTotalWithDiscount = state.discount > 0
        ? Math.round(rawTotal * (1 - state.discount / 100))
        : newTotal;
      return {
        ...state,
        products: updatedProducts,
        total: newTotal,
        totalWithDiscount: newTotalWithDiscount,
      };
    }
    case "removeUnit": {
      const updatedProducts = state.products.map((product) => {
        if (product.id === action.payload.id && product.amount > 1) {
          return { ...product, amount: product.amount - 1 };
        }
        return product;
      });
      const rawTotal = updatedProducts.reduce(
        (acc, cur) => acc + cur.salePrice * cur.amount, 0
      );
      const newTotal = Math.round(rawTotal);
      const newTotalWithDiscount = state.discount > 0
        ? Math.round(rawTotal * (1 - state.discount / 100))
        : newTotal;
      return {
        ...state,
        products: updatedProducts,
        total: newTotal,
        totalWithDiscount: newTotalWithDiscount,
      };
    }
    case "removeItem": {
      const updatedProducts = state.products.filter(
        (product) => product.id !== action.payload.id
      );
      const rawTotal = updatedProducts.reduce(
        (acc, cur) => acc + cur.salePrice * cur.amount, 0
      );
      const newTotal = Math.round(rawTotal);
      const newTotalWithDiscount = state.discount > 0
        ? Math.round(rawTotal * (1 - state.discount / 100))
        : newTotal;
      return {
        ...state,
        products: updatedProducts,
        total: newTotal,
        totalWithDiscount: newTotalWithDiscount,
      };
    }
    case "removeAll":
      return {
        ...state,
        products: [],
        documentNumber: 0,
        billType: "Factura C",
        IVACondition: "Consumidor Final",
        nroAsociado: 0,
        total: 0,
        date: new Date(),
        paidMethod: "Efectivo",
        totalWithDiscount: 0,
        pago: false,
        entrega: 0,
        discount: 0,
        typeDocument: "",
        CAE: { CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" },
      };
    case "changePrice":
      return {
        ...state,
        products: state.products.map(({ ...product }) => {
          if (product.id === action.payload.id) {
            product.price = action.payload.price;
          }

          return product;
        }),
      };
    case "changeUnit": {
      const updatedProducts = state.products.map((product) => {
        if (product.id === action.payload.id) {
          return { ...product, amount: action.payload.amount };
        }
        return product;
      });
      const rawTotal = updatedProducts.reduce(
        (acc, cur) => acc + cur.salePrice * cur.amount, 0
      );
      const newTotal = Math.round(rawTotal);
      const newTotalWithDiscount = state.discount > 0
        ? Math.round(rawTotal * (1 - state.discount / 100))
        : newTotal;
      return {
        ...state,
        products: updatedProducts,
        total: newTotal,
        totalWithDiscount: newTotalWithDiscount,
      };
    }
    case "total":
      return {
        ...state,
        total: Math.round(
          state.products.reduce(
            (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
            0
          )
        ),
      };
    case "discount": {
      const rawTotal = state.products.reduce(
        (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
        0
      );
      return {
        ...state,
        discount: action.payload,
        totalWithDiscount:
          action.payload > 0
            ? Math.round(rawTotal * (1 - action.payload / 100))
            : Math.round(rawTotal),
      };
    }
    case "sellerName":
      return {
        ...state,
        seller: action.payload,
      };
    case "entrega":
      return {
        ...state,
        entrega: action.payload,
      };
    case "typeDocument":
      return {
        ...state,
        typeDocument: action.payload,
      };
    case "billType":
      return {
        ...state,
        billType: action.payload,
      };
    case "documentNumber": {
      return {
        ...state,
        documentNumber: action.payload,
      };
    }
    case "nroAsociado": {
      return {
        ...state,
        nroAsociado: action.payload,
      };
    }
    case "IVACondition": {
      return {
        ...state,
        IVACondition: action.payload,
      };
    }
    case "paidMethod": {
      return {
        ...state,
        paidMethod: action.payload,
      };
    }
    case "CAE": {
      console.log("Modificando CAE");
      return {
        ...state,
        CAE: { ...action.payload },
      };
    }
    case "date": {
      return {
        ...state,
        date: action.payload,
      };
    }
    case "clientId": {
      return {
        ...state,
        clientId: action.payload,
      };
    }
    case "client": {
      return {
        ...state,
        client: action.payload,
      };
    }
    case "setState": {
      state = action.payload;
      return {
        ...state,
        CAE: action.payload.CAE,
        IVACondition: action.payload.IVACondition,
        billType: action.payload.billType,
        documentNumber: action.payload.documentNumber,
        typeDocument: action.payload.typeDocument,
      };
    }
    case "updateSalePrice":
      return {
        ...state,
        products: state.products.map((product) => {
          if (product.id === action.payload.id) {
            return { ...product, salePrice: action.payload.salePrice };
          }
          return product;
        }),
      };
    default:
      return state;
  }
};
