import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import clsx from "clsx";

type Props = {
  open: boolean;
  onClose: ()=>void;
  title?: string;
  children?: React.ReactNode;
};

export const Modal: React.FC<Props> = ({ open, onClose, title, children }) => {
  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      if(e.key === "Escape") onClose();
    }
    if(open) document.addEventListener("keydown", onKey);
    return ()=> document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if(!open) return null;
  return ReactDOM.createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--molam-bg)] rounded-2xl max-w-xl w-full p-6 shadow-lg z-10">
        {title && <h2 className="text-lg font-semibold mb-3">{title}</h2>}
        <div>{children}</div>
      </div>
    </div>,
    document.body
  );
};

