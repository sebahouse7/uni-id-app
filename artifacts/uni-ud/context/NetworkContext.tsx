import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import { apiCheckHealth } from "@/lib/apiClient";

interface NetworkContextType {
  isOnline: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  checkConnection: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  isChecking: false,
  lastChecked: null,
  checkConnection: async () => true,
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      setIsOnline(true);
      return true;
    }
    setIsChecking(true);
    try {
      const ok = await apiCheckHealth();
      setIsOnline(ok);
      setLastChecked(new Date());
      return ok;
    } catch {
      setIsOnline(false);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();

    checkIntervalRef.current = setInterval(() => {
      checkConnection();
    }, 60000);

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        nextState === "active" &&
        appStateRef.current.match(/inactive|background/)
      ) {
        checkConnection();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [checkConnection]);

  return (
    <NetworkContext.Provider value={{ isOnline, isChecking, lastChecked, checkConnection }}>
      {children}
    </NetworkContext.Provider>
  );
}

export const useNetwork = () => useContext(NetworkContext);
