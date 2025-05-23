"use client";
import React from "react";
interface props {
  text: string;
  handleClick: () => void;
  active: boolean;
}
const FilterSwitch = ({ text, handleClick, active }: props) => {
  return (
    <button
      onClick={handleClick}
      className={` text-sm sm:text-md rounded-full p-2 ${
        active
          ? "bg-black font-bold text-white shadow-lg shadow-gray-800"
          : "bg-slate-200 text-black font-semibold shadow-md shadow-gray-500"
      }`}
    >
      {text}
    </button>
  );
};

export default FilterSwitch;
