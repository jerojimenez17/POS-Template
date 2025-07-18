"use client";
import { Button } from "./button";

interface Props {
  onClick: () => void;
  className: string;
  disable: boolean;
}
const PlusButton = ({ onClick, className, disable = true }: Props) => {
  return (
    <Button
      disabled={disable}
      onClick={onClick}
      className={`px-1 ${
        disable ? "cursor-not-allowed" : "cursor-pointer"
      }  disabled:cursor-not-allowed font-bold text-lg bg-transparent h-full text-green-700/50 rounded hover:bg-gray-300 print:hidden ${className}`}
    >
      +
    </Button>
  );
};

export default PlusButton;
