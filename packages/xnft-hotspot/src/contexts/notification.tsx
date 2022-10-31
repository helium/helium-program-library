import { AnchorProvider, Provider } from "@project-serum/anchor";
import React, { useContext, useState, useCallback } from "react";

export const NotificationContext =
  React.createContext<INotificationReactState>({
    setMessage: (message: string, type: string) => {},
    message: null,
    type: null,
  });

export interface INotificationReactState {
  setMessage: (message: string, type: "info" | "error" | "success") => void;
  message: string | null;
  type: string | null;
}

export const NotificationProviderRaw: React.FC<React.PropsWithChildren<unknown>> = ({ children }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [timeoutId, setTimeoutId] = useState<any>(null);

  const setMessageWrapper = useCallback((message: string, type: string) => {
    setMessage(message);
    setType(type);

    if (timeoutId) clearTimeout(timeoutId);
    const newtimeoutId = setTimeout(() => {
      setMessage(null);
      setType(null);
    }, 5000);

    setTimeoutId(newtimeoutId);
  }, [timeoutId])
  return (
    <NotificationContext.Provider value={{ setMessage: setMessageWrapper, message, type}}>
      {children}
    </NotificationContext.Provider>
  );
};

//@ts-ignore
export const NotificationProvider: React.FC = ({ children }) => {
  //@ts-ignore
  return <NotificationProviderRaw>{children}</NotificationProviderRaw>;
};

export const useNotification = (): INotificationReactState => {
  return useContext(NotificationContext);
};
