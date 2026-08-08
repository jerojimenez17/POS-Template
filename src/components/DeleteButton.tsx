"use client";

import { Trash2 } from "lucide-react";

interface props {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  id?: string;
  disable: boolean;
}
const DeleteButton = ({ onClick, id, disable }: props) => {
  return (
    <button
      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      id={id}
      onClick={onClick}
      disabled={disable}
    >
      <Trash2 className="h-5 w-5" />
    </button>
  );
};

export default DeleteButton;
