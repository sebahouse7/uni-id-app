import * as LocalAuthentication from "expo-local-authentication";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { secureGet, secureSet, secureDelete } from "./SecureStorage";

const LOCK_TIMEOUT_MS = 3 * 60 * 1000;
const PIN_KEY = "@uni_pin";
const FAIL_COUNT_KEY = "@uni_pin_fails";
const LOCKED_UNTIL_KEY = "@uni_pin_locked_until";
const MAX_FAILS = 5;
const LOCKOUT_DURATION_MS = 30 * 1000;

interface AuthContextType {
  isLocked: boolean;
  isAuthenticated: boolean;
  hasBiometrics: boolean;
  hasPin: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  unlock: () => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  lock: () => void;
  successState: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isLocked: false,
  isAuthenticated: false,
  hasBiometrics: false,
  hasPin: false,
  failedAttempts: 0,
  lockedUntil: null,
  unlock: async () => true,
  setPin: async () => {},
  verifyPin: async () => false,
  lock: () => {},
  successState: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [successState, setSuccessState] = useState(false);
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

      const failCount = parseInt((await secureGet(FAIL_COUNT_KEY)) ?? "0", 10);
      const lockedUntilStr = await secureGet(LOCKED_UNTIL_KEY);
      if (lockedUntilStr) {
        const lockedUntilTs = parseInt(lockedUntilStr, 10);
        if (lockedUntilTs > Date.now()) {
          setLockedUntil(lockedUntilTs);
          setFailedAttempts(failCount);
        } else {
          await secureDelete(LOCKED_UNTIL_KEY);
          await secureDelete(FAIL_COUNT_KEY);
        }
      }

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
          setSuccessState(false);
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
        await showSuccessAndUnlock();
        return true;
      }
      return false;
    } catch {
      setIsAuthenticated(true);
      return true;
    }
  };

  const showSuccessAndUnlock = async () => {
    setSuccessState(true);
    await new Promise((r) => setTimeout(r, 700));
    setIsAuthenticated(true);
    setIsLocked(false);
    setSuccessState(false);
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

  const isCurrentlyLocked = () => {
    if (!lockedUntil) return false;
    return lockedUntil > Date.now();
  };

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    if (isCurrentlyLocked()) return false;

    const stored = await secureGet(PIN_KEY);
    const ok = stored === pin;

    if (ok) {
      await secureDelete(FAIL_COUNT_KEY);
      await secureDelete(LOCKED_UNTIL_KEY);
      setFailedAttempts(0);
      setLockedUntil(null);
      await showSuccessAndUnlock();
      return true;
    } else {
      const newCount = failedAttempts + 1;
      setFailedAttempts(newCount);
      await secureSet(FAIL_COUNT_KEY, String(newCount));

      if (newCount >= MAX_FAILS) {
        const until = Date.now() + LOCKOUT_DURATION_MS;
        setLockedUntil(until);
        await secureSet(LOCKED_UNTIL_KEY, String(until));
        setFailedAttempts(0);
        await secureDelete(FAIL_COUNT_KEY);
      }
      return false;
    }
  }, [failedAttempts, lockedUntil]);

  const lock = useCallback(() => {
    setIsAuthenticated(false);
    setIsLocked(true);
    setSuccessState(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLocked,
        isAuthenticated,
        hasBiometrics,
        hasPin,
        failedAttempts,
        lockedUntil,
        unlock,
        setPin,
        verifyPin,
        lock,
        successState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
