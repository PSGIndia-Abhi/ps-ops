import { createContext, useContext } from "react";

export const ToastContext = createContext({ push: () => {} });

/** push({ type: "success" | "error" | "info", title, text }) */
export const useToast = () => useContext(ToastContext);
