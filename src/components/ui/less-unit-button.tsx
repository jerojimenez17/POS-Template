"use client";

import LessButton from "./LessButton";

interface LessUnitButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const LessUnitButton = ({ onClick, disabled = false }: LessUnitButtonProps) => {
  return (
    <LessButton
      onClick={onClick}
      disable={disabled}
      className=""
    />
  );
};

export default LessUnitButton;
