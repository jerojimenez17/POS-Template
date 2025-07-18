/* eslint-disable react-hooks/rules-of-hooks */
"use client";
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebase/config";
import Account, { ProductAccount } from "@/models/Account";
import moment from "moment";
import AccountCard from "@/components/account/AccountCard";
import AccountDetail from "@/components/account/AccountDetail";
import { Poppins } from "next/font/google";
import { useRouter } from "next/navigation";

const poppins = Poppins({
  variable: "--font-poppins-sans",
  subsets: ["latin"],
  weight: "600",
});
const page = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      const snapshot = await getDocs(collection(db, "accountLedger"));
      const data = snapshot.docs.map((doc) => {
        const d = doc.data();
        const productsAccount = d.productsAccount.map(
          (productAccount: ProductAccount) => {
            return new ProductAccount(
              productAccount,
              productAccount.amount,
              moment(productAccount.date.toDate())
            );
          }
        );
        return new Account(
          doc.id,
          d.clientName,
          d.clientEmail,
          d.clientPhone,
          productsAccount || [],
          moment(d.date.toDate()),
          moment(d.last_update.toDate())
        );
      });
      setAccounts(data);
    };

    fetchAccounts();
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const router = useRouter();
  return (
    <div className="p-4 h-full flex flex-col overflow-auto py-14 space-y-4">
      <h1
        className={`text-xl text-center text-gray-800 font-bold ${poppins.className}`}
      >
        Fichero de Cuentas
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3  gap-4">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onClick={() => {
              router.push(`/account-ledger/${account.id}`);
            }}
          />
        ))}
      </div>
      {selectedAccount && (
        <AccountDetail
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </div>
  );
};

export default page;
