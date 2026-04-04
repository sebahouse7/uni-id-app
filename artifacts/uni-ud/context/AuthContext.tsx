import * as LocalAuthentication from "expo-local-authentication";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import { secureDelete, secureGet, secureSet } from "./SecureStorage";
import {
  getPin,
  migrateOldPinKeys,
  savePin,
  validatePin,
} from "@/lib/authService";

const LOCK_TIMEOUT_MS = 3 * 60 * 1000;
const FAIL_COUNT_KEY = "uni_id_pin_fails_v1";
const LOCKED_UNTIL_KEY = "uni_id_pin_locked_until_v1";
const BIOMETRICS_ENABLED_KEY = "uni_id_biometrics_enabled_v1";
const MAX_FAILS = 5;
const LOCKOUT_DURATION_MS = 30 * 1000;

interface AuthContextType {
  isLoading: boolean;
  isLocked: boolean;
  isAuthenticated: boolean;
  hasBiometrics: boolean;
  biometricsEnabled: boolean;
  hasPin: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  unlock: () => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  lock: () => void;
  successState: boolean;
  enableBiometrics: () => Promise<void>;
  disableBiometrics: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isLocked: false,
  isAuthenticated: false,
  hasBiometrics: false,
  biometricsEnabled: false,
  hasPin: false,
  failedAttempts: 0,
  lockedUntil: null,
  unlock: async () => true,
  setPin: async () => {},
  verifyPin: async () => false,
  lock: () => {},
  successState: false,
  enableBiometrics: async () => {},
  disableBiometrics: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [successState, setSuccessState] = useState(false);

  const lastActiveRef = useRef(Date.now());
  const appStateRef = useRef(AppState.currentState);
  const biometricInProgressRef = useRef(false);
  const initDoneRef = useRef(false);

  useEffect(() => {
    if (!initDoneRef.current) {
      initDoneRef.current = true;
      initAuth();
    }
  }, []);

  async function initAuth() {
    try {
      if (Platform.OS === "web") {
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      await migrateOldPinKeys();

      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const biometricsAvailable = compatible && enrolled;
      setHasBiometrics(biometricsAvailable);

      // Only use biometrics if user explicitly enabled them in the app
      const bioEnabledStr = await secureGet(BIOMETRICS_ENABLED_KEY).catch(() => null);
      const bioEnabled = bioEnabledStr === "true" && biometricsAvailable;
      setBiometricsEnabled(bioEnabled);

      const storedPin = await getPin();
      setHasPin(!!storedPin);

      try {
        const failCount = parseInt(
          (await secureGet(FAIL_COUNT_KEY)) ?? "0",
          10
        );
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
      } catch {}

      // Only attempt biometric if user explicitly enabled it
      if (bioEnabled) {
        const success = await attemptBiometric();
        if (!success) {
          setIsLocked(true);
        }
        return;
      }

      if (storedPin) {
        setIsLocked(true);
        return;
      }

      // No PIN and no biometrics enabled — first-time user, lock so they can create a PIN
      setIsLocked(true);
    } catch {
      setIsAuthenticated(true);
    } finally {
      setIsLoading(false);
    }
  }

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
    if (biometricInProgressRef.current) return false;
    biometricInProgressRef.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Verificá tu identidad para acceder a uni.id",
        fallbackLabel: "Usar PIN",
        cancelLabel: "Cancelar",
        disableDeviceFallback: true,
      });
      if (result.success) {
        await showSuccessAndUnlock();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      biometricInProgressRef.current = false;
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

  const setPinFn = useCallback(async (pin: string) => {
    await savePin(pin);
    setHasPin(true);
  }, []);

  const isCurrentlyLocked = () => {
    if (!lockedUntil) return false;
    return lockedUntil > Date.now();
  };

  const verifyPin = useCallback(
    async (input: string): Promise<boolean> => {
      if (isCurrentlyLocked()) return false;

      try {
        const ok = await validatePin(input);

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
      } catch {
        return false;
      }
    },
    [failedAttempts, lockedUntil]
  );

  const lock = useCallback(() => {
    setIsAuthenticated(false);
    setIsLocked(true);
    setSuccessState(false);
  }, []);

  const enableBiometrics = useCallback(async () => {
    await secureSet(BIOMETRICS_ENABLED_KEY, "true");
    setBiometricsEnabled(true);
  }, []);

  const disableBiometrics = useCallback(async () => {
    await secureDelete(BIOMETRICS_ENABLED_KEY);
    setBiometricsEnabled(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isLocked,
        isAuthenticated,
        hasBiometrics,
        biometricsEnabled,
        hasPin,
        failedAttempts,
        lockedUntil,
        unlock,
        setPin: setPinFn,
        verifyPin,
        lock,
        successState,
        enableBiometrics,
        disableBiometrics,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
