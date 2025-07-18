"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { IDetectedBarcode, Scanner } from "@yudiel/react-qr-scanner";

interface props {
  onScan: (result: IDetectedBarcode[]) => void;
  errorMessage: string;
  className?: string;
}

const CodeScanner = ({ onScan, errorMessage, className }: props) => {
  const [scanerOpen, setScanerOpen] = useState(false);
  return (
    <div
      onFocus={(e) => e.target.focus()}
      onClick={() => focus()}
      className={className || ""}
    >
      <div className="flex w-28 my-auto">
        <Button className="bg-transparent hover:fill-white font-bold print:hidden text-2xl p-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="70px"
            height="70px"
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
      </div>

      {scanerOpen && (
        <div className="h-full w-full items-center flex  z-10">
          <Button
            className=" absolute top-24 z-30 right-4 text-white font-bold"
            onClick={() => setScanerOpen(false)}
          >
            Cerrar Scaner
          </Button>
          <div className=" md:mx-auto">
            <Scanner
              formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
              onScan={onScan}
            />
          </div>
        </div>
      )}
      {errorMessage !== "" && (
        <div className=" w-full mx-auto text-red-600 text-lg">
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default CodeScanner;
