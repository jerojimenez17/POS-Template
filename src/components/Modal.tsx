"use client";
import React, { ReactElement } from "react";

interface props {
  visible: boolean;
  onClose: () => void;
  onAcept?: () => void;
  onCancel?: () => void;
  blockButton: boolean;
  link?: string;
  children?: ReactElement;
  message?: string;
  className?: string;
}
const Modal = ({
  visible,
  children,
  onClose,
  message,
  onAcept,
  className,
  onCancel,
  blockButton,
}: props) => {
  if (!visible) return null;
  return (
    <div
      className={`fixed h-full  w-full inset-0 bg-black/25 backdrop-blur-xs flex flex-col items-center ${className}`}
    >
      <div className=" flex flex-col w-3/4 md:w-1/2 items-center mt-24 h-full">
        <button
          className="text-white text-2xl font-bold place-self-end md:mr-28 hover:text-black"
          onClick={onClose}
        >
          X
        </button>
        <div className="bg-white px-12 py-2 bg-opacity-70 rounded-lg w-lg h-[65vh] md:h-[75vh] flex flex-col overflow-auto">
          <div className="m-3 flex grow mx-auto text-center flex-col justify-center text-black">
            {message}
          </div>
          {children}
          {/* {link && (
            <a href={link} className="text-black font-semibold">
              Pagar aqui
            </a>
          )} */}

          <div className="flex w-full h-12 justify-around">
            {onAcept && (
              <button
                disabled={blockButton}
                onClick={onAcept}
                className="p-2 bg-black text-white font-semibold rounded-2xl hover:shadow-md hover:shadow-gray-200"
              >
                Aceptar
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-2 border border-gray-800 text-black font-semibold rounded-2xl hover:shadow-md hover:shadow-gray-200"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
