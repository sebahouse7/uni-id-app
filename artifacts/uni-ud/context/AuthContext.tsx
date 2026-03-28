import * as LocalAuthentication from "expo-local-authentication";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { secureGet, secureSet } from "./SecureStorage";

const LOCK_TIMEOUT_MS = 3 * 60 * 1000;
const PIN_KEY = "@uni_pin";

interface AuthContextType {
  isLocked: boolean;
  isAuthenticated: boolean;
  hasBiometrics: boolean;
  hasPin: boolean;
  unlock: () => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  lock: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isLocked: false,
  isAuthenticated: false,
  hasBiometrics: false,
  hasPin: false,
  unlock: async () => true,
  setPin: async () => {},
  verifyPin: async () => false,
  lock: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const lastActiveRef = useRef(Date.now());
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") {
        setIsAuthenticated(true);
        return;
      }
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBiometrics(compatible && enrolled);

      const storedPin = await secureGet(PIN_KEY);
      setHasPin(!!storedPin);

      if (!compatible || !enrolled) {
        setIsAuthenticated(true);
        return;
      }
      await attemptBiometric();
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (
        appStateRef.current.match(/active/) &&
        nextState.match(/inactive|background/)
      ) {
        lastActiveRef.current = Date.now();
      }
      if (
        nextState === "active" &&
        appStateRef.current.match(/inactive|background/)
      ) {
        const elapsed = Date.now() - lastActiveRef.current;
        if (elapsed > LOCK_TIMEOUT_MS && isAuthenticated) {
          setIsAuthenticated(false);
          setIsLocked(true);
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  const attemptBiometric = async (): Promise<boolean> => {
    if (Platform.OS === "web") return true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Verificá tu identidad para acceder",
        fallbackLabel: "Usar PIN",
        cancelLabel: "Cancelar",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setIsAuthenticated(true);
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      setIsAuthenticated(true);
      return true;
    }
  };

  const unlock = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      setIsAuthenticated(true);
      return true;
    }
    return attemptBiometric();
  }, []);

  const setPin = useCallback(async (pin: string) => {
    await secureSet(PIN_KEY, pin);
    setHasPin(true);
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    const stored = await secureGet(PIN_KEY);
    const ok = stored === pin;
    if (ok) {
      setIsAuthenticated(true);
      setIsLocked(false);
    }
    return ok;
  }, []);

  const lock = useCallback(() => {
    setIsAuthenticated(false);
    setIsLocked(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLocked,
        isAuthenticated,
        hasBiometrics,
        hasPin,
        unlock,
        setPin,
        verifyPin,
        lock,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
