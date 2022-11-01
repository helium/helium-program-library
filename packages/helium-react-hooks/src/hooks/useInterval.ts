import { useRef, useEffect } from "react";

export function useInterval(
  callback: (...args: any[]) => void,
  delay: number | null,
  deps: any[] = []
) {
  const savedCallbackRef = useRef<(...args: any[]) => void>();

  useEffect(() => {
    savedCallbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const handler = (...args: any[]) => savedCallbackRef.current!(...args);

    if (delay !== null) {
      handler();
      const intervalId = setInterval(handler, delay);
      return () => clearInterval(intervalId);
    }
  }, [delay, ...deps]);
}
