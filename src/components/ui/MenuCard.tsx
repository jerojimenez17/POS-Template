"use client";

import { useRouter } from "next/navigation";

interface props {
  url: string;
  children: React.ReactNode;
  title: string;
}
const MenuCard = ({ url, title, children }: props) => {
  const router = useRouter();
  return (
    <div
      className="w-52 h-1/3 justify-center rounded-xl flex flex-col items-center bg-slate-100 bg-opacity-87 shadow-gray-400 hover:bg-slate-200 focus:bg-white hover:ring-3 hover:ring-gray-200 hover:text-pink-30 hover:shadow-gray-700 overflow-hidden shadow-lg p-2"
      onClick={() => router.push(url)}
    >
      <span className="fill-black">{children}</span>
      <h2 className="w-full text-center text-black hover:text-white text-opacity-80 font-semibold text-lg">
        {title}
      </h2>
    </div>
  );
};

export default MenuCard;
