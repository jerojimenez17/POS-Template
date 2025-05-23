"use client";
import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Scanner } from "@yudiel/react-qr-scanner";

interface props {
  handleOpenModal: () => void;
  handleDescriptionFilter: (filter: string) => void;
}
const StockFilterPanel = ({
  handleOpenModal,
  handleDescriptionFilter,
}: props) => {
  const [scanerOpen, setScanerOpen] = useState(false);
  const [descriptionFilterInput, setDescriptionFilterInput] = useState("");
  return (
    <div className="h-28 w-full flex items-center justify-center bg-white bg-opacity-25 shadow-sm rounded-lg mx-auto my-2">
      <Input
        className="w-1/2 h-10 font-bold rounded-full appearance-none border border-gray-800 text-gray-800"
        type="search"
        placeholder="Buscar..."
        value={descriptionFilterInput}
        onChange={(e) => {
          setDescriptionFilterInput(e.currentTarget.value);
          if (e.currentTarget.value === "") {
            handleDescriptionFilter("");
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleDescriptionFilter(descriptionFilterInput);
          }
        }}
      />
      <Button
        variant="outline"
        className="rounded-full hover:shadow-md shadow-xs h-10 p-1 m-2 text-gray-800 ring-2 ring-gray-800 font-bold hover:font-bold target:bg-blue-400"
        onClick={handleOpenModal}
      >
        ➕Nuevo Producto
      </Button>
      <Button
        className="text-gray-400 font-bold bg-white text-5xlg"
        onClick={() => setScanerOpen(true)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="50px"
          height="50px"
          viewBox="0 0 32 32"
          id="svg5"
          version="1.1"
        >
          <defs id="defs2" />

          <g id="layer1" transform="translate(-108,-100)">
            <path
              d="m 111,106 a 1.0001,1.0001 0 0 0 -1,1 v 3 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -2 h 2 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 z"
              id="path11698"
            />

            <path
              d="m 134,106 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 2 v 2 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -3 a 1.0001,1.0001 0 0 0 -1,-1 z"
              id="path11700"
            />

            <path
              d="m 137,121 a 1,1 0 0 0 -1,1 v 2 h -2 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 3 a 1.0001,1.0001 0 0 0 1,-1 v -3 a 1,1 0 0 0 -1,-1 z"
              id="path11702"
            />

            <path
              d="m 111,121 a 1,1 0 0 0 -1,1 v 3 a 1.0001,1.0001 0 0 0 1,1 h 3 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 h -2 v -2 a 1,1 0 0 0 -1,-1 z"
              id="path11704"
            />

            <path
              d="m 115,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
              id="path11706"
            />

            <path
              d="m 118,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
              id="path11708"
            />

            <path
              d="m 121,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
              id="path11710"
            />

            <path
              d="m 124,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
              id="path11712"
            />

            <path
              d="m 127,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
              id="path11714"
            />

            <path
              d="m 130,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
              id="path11716"
            />

            <path
              d="m 133,110 a 1,1 0 0 0 -1,1 v 5.20703 1.31445 V 121 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 V 117.52148 116.20703 111 a 1,1 0 0 0 -1,-1 z"
              id="path11720"
            />
          </g>
        </svg>
      </Button>
      {scanerOpen && (
        <div className="h-screen w-screen items-center flex  z-10">
          <Button
            className="bg-black absolute top-24 z-20 right-4 text-white font-bold"
            onClick={() => setScanerOpen(false)}
          >
            Cerrar Scaner
          </Button>
          <div className="flex absolute top-0 right-1 md:right-1/4">
            <Scanner
              formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
              onScan={(result) => {
                setDescriptionFilterInput(result[0].rawValue);
                setTimeout(() => {
                  handleDescriptionFilter(descriptionFilterInput);
                }, 300);
                setScanerOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default StockFilterPanel;
