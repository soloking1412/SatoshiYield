import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
import { Icon } from "./Icon.js";
export function Modal({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose: () => void }) {
  // Call sites use external buttons rather than Dialog.Trigger. Retain that
  // opener before Radix moves focus, including when this component unmounts.
  const opener = useRef(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content" onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); else document.getElementById("main-content")?.focus(); }}><Dialog.Title>{title}</Dialog.Title><Dialog.Description className="dialog-description">{description}</Dialog.Description><Dialog.Close className="dialog-close" aria-label="Close dialog"><Icon name="close" size={18} /></Dialog.Close>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
