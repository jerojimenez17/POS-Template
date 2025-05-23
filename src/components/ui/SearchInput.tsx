"use client";
import React from "react";
import { Input } from "./input";

interface props {
  className?: string;
  handleSearch: (search: string) => void;
  handleOnChange?: (search: string) => void;
}
const SearchInput = ({ className, handleSearch, handleOnChange }: props) => {
  return (
    <Input
      className={`w-1/2 flex ${className} h-10 font-bold rounded-full appearance-none border border-blue-400`}
      type="search"
      placeholder="Buscar..."
      onChange={(e) => {
        // handleDescriptionFilter("");
        if (handleOnChange) {
          handleOnChange(e.currentTarget.value);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          handleSearch(e.currentTarget.value);
          // handleDescriptionFilter(e.currentTarget.value.toLowerCase());
        }
      }}
    />
  );
};

export default SearchInput;
