"use client";

import { Button } from "./button";

interface Props {
  onClick: () => void;
  className: string;
  disable: boolean;
}
const LessButton = ({ onClick, className, disable }: Props) => {
  return (
    <Button
      disabled={disable}
      onClick={onClick}
      className={`px-1 disabled:cursor-not-allowed cursor-pointer font-bold text-lg bg-transparent h-full my-auto text-red-600/40  rounded hover:bg-gray-300 print:hidden ${className}`}
    >
      -
    </Button>
  );
};

export default LessButton;
