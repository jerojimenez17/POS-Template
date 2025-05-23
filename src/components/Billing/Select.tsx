"use client";
import React from "react";

interface props {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleChange: (e: any) => void;
  options: string[];
  defaultValue?: string;
  value: string;
  active?: boolean;
}

const Select = ({
  id,
  options,
  active,
  value,
  defaultValue,
  handleChange,
}: props) => {
  return (
    <select
      id={id}
      disabled={!active}
      onChange={handleChange}
      value={value}
      className="block mb-2 mx-auto bg-white rounded-lg shadow-md hover:shadow-gray-400 text-sm p-3 text-gray-500 border-0 border-b-2 broder-gray-200 focus:ring-transparent  dark:text-gray-400 dark:border-gray-700 focus:outline-none focus:ring-0 focus:border-gray-200 peer"
    >
      {/* <option value={defaultValue}>{defaultValue}</option> */}

      {defaultValue && (
        <option value={defaultValue} className="p-2">
          {defaultValue}
        </option>
      )}

      {options.map((option) => (
        <option key={Math.random()} value={option} className="p-2">
          {option}
        </option>
      ))}
    </select>
  );
};

export default Select;
