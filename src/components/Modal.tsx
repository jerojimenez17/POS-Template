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
      className={`fixed h-full  w-full inset-0 bg-black bg-opacity-25 backdrop-blur-sm flex flex-col items-center ${className}`}
    >
      <div className=" flex flex-col w-fit mt-24 h-full">
        <button
          className="text-white text-xl place-self-end hover:text-black"
          onClick={onClose}
        >
          X
        </button>
        <div className="bg-white p-4 bg-opacity-70 rounded-lg w-[50vh] h-[75vh] flex flex-col overflow-auto">
          <div className="m-3 flex flex-grow mx-auto text-black">{message}</div>
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
                className="p-2 bg-black text-white font-semibold rounded-2xl hover:shadow-md hover:shadow-pink-200"
              >
                Aceptar
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="p-2 border border-gray-800 text-black font-semibold rounded-2xl hover:shadow-md hover:shadow-pink-200"
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
