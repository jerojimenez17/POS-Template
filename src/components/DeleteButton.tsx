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
      className="cursor-pointer my-auto"
      id={id}
      onClick={onClick}
      disabled={disable}
    >
      <Trash2 className="h-5 w-5 text-red-500 hover:text-red-700" />
    </button>
  );
};

export default DeleteButton;
