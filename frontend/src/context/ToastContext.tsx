import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "pending";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  txid?: string;  // if set, shows an explorer link
}

interface ToastState {
  toasts: Toast[];
  show: (opts: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

const EXPLORER = "https://explorer.hiro.so/txid";
const CHAIN = "testnet";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const show = useCallback(
    (opts: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { ...opts, id }]);

      // auto-dismiss: longer for pending (user may want to act), shorter for success/error
      const ms = opts.variant === "pending" ? 8_000 : 6_000;
      const timer = setTimeout(() => dismiss(id), ms);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss }}>
      {children}
      <ToastList toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): Pick<ToastState, "show"> {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return { show: ctx.show };
}

/* ─── visual component ─── */

function ToastList({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-[120] flex flex-col gap-3 sm:max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: string) => void;
}) {
  const bg =
    toast.variant === "success"
      ? "bg-green-900/90 border-green-700"
      : toast.variant === "error"
      ? "bg-red-900/90 border-red-700"
      : "bg-surface-card border-surface-border";

  const icon =
    toast.variant === "success"
      ? "✅"
      : toast.variant === "error"
      ? "❌"
      : "⏳";

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm text-sm ${bg}`}
      style={{ animation: "slideUp 0.2s ease-out" }}
    >
      <span className="text-base mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-text-primary font-medium leading-snug">{toast.message}</p>
        {toast.txid && (
          <a
            href={`${EXPLORER}/${toast.txid}?chain=${CHAIN}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-orange hover:underline mt-0.5 block truncate"
          >
            View on Explorer ↗
          </a>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="text-text-muted hover:text-text-primary mt-0.5 flex-shrink-0 text-base leading-none"
      >
        ✕
      </button>
    </div>
  );
}
