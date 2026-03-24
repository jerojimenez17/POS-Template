"use client";

import PlusButton from "./PlusButton";

interface AddUnitButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const AddUnitButton = ({ onClick, disabled = false }: AddUnitButtonProps) => {
  return (
    <PlusButton
      onClick={onClick}
      disable={disabled}
      className=""
    />
  );
};

export default AddUnitButton;
