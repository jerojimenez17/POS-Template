"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface Props {
  onScan: (result: unknown[]) => void;
  errorMessage: string;
  className?: string;
}

export default function CodeScanner({
  onScan,
  errorMessage,
  className,
}: Props) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    if (!scannerOpen) {
      return;
    }

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    reader.decodeFromVideoDevice(
      undefined, // cámara por defecto
      videoRef.current!,
      (result) => {
        if (result) {
          // adaptamos al formato de tu función actual
          onScan([
            {
              rawValue: result.getText(),
              format: result.getBarcodeFormat(),
            },
          ]);

          // Evita dobles lecturas
          setScannerOpen(false);
        }
      }
    );
  }, [scannerOpen]);

  return (
    <div className={className || ""}>
      {/* BOTÓN ABRIR */}
      <div className="flex w-28 my-auto">
        <Button
          onClick={() => setScannerOpen(true)}
          className="bg-transparent hover:fill-white font-bold print:hidden text-2xl p-2"
        >
          {/* Tu mismo ícono */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="70px"
            height="70px"
            viewBox="0 0 32 32"
          >
            <g transform="translate(-108,-100)">
              <path d="m 111,106 a 1.0001,1.0001 0 0 0 -1,1 v 3 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -2 h 2 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 z" />
              <path d="m 134,106 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 2 v 2 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -3 a 1.0001,1.0001 0 0 0 -1,-1 z" />
              <path d="m 137,121 a 1,1 0 0 0 -1,1 v 2 h -2 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 3 a 1.0001,1.0001 0 0 0 1,-1 v -3 a 1,1 0 0 0 -1,-1 z" />
              <path d="m 111,121 a 1,1 0 0 0 -1,1 v 3 a 1.0001,1.0001 0 0 0 1,1 h 3 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 h -2 v -2 a 1,1 0 0 0 -1,-1 z" />
            </g>
          </svg>
        </Button>
      </div>

      {/* SCANNER OVERLAY */}
      {scannerOpen && (
        <div className="h-full w-full items-center flex z-10">
          <Button
            className="absolute top-24 z-30 right-4 text-white font-bold"
            onClick={() => setScannerOpen(false)}
          >
            Cerrar Scanner
          </Button>

          <div className="md:mx-auto">
            <video
              ref={videoRef}
              className="rounded-xl shadow-xl"
              style={{ width: "100%", height: "auto" }}
            />
          </div>
        </div>
      )}

      {/* ERROR */}
      {errorMessage && (
        <div className="w-full mx-auto text-red-600 text-lg">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
