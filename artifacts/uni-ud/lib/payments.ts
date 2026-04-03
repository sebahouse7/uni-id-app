import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getLocales } from "expo-localization";
import { Platform } from "react-native";

import {
  apiCreateMercadoPagoCheckout,
  apiCreateStripeCheckout,
} from "./apiClient";

export type PlanId = "basic" | "pro";
export type PaymentRegion = "latam" | "global";
export type PaymentStatus = "success" | "failure" | "pending" | "cancelled";

export function detectPaymentRegion(): PaymentRegion {
  try {
    const locale = getLocales()[0];
    const region = locale?.regionCode?.toUpperCase() ?? "";
    const latamCountries = [
      "AR","BR","MX","CO","CL","PE","UY","PY","BO","EC","VE","CR","PA","DO","GT","HN","NI","SV","CU","PR"
    ];
    return latamCountries.includes(region) ? "latam" : "global";
  } catch {
    return "latam";
  }
}

export async function checkPaymentConfig(): Promise<{ mercadopago: boolean; stripe: boolean }> {
  try {
    const base = process.env["EXPO_PUBLIC_API_URL"] ?? "/api";
    const res = await fetch(`${base}/subscriptions/status`);
    if (!res.ok) return { mercadopago: false, stripe: false };
    return res.json();
  } catch {
    return { mercadopago: false, stripe: false };
  }
}

export async function createMercadoPagoCheckout(
  planId: PlanId,
  _userId: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const backUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : Linking.createURL("payment-result");
    const data = await apiCreateMercadoPagoCheckout(planId, backUrl);
    const url = data.initPoint ?? data.sandboxInitPoint ?? null;
    return { url };
  } catch (e: any) {
    return { url: null, error: e.message };
  }
}

export async function createStripeCheckout(
  planId: PlanId,
  _userId: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const data = await apiCreateStripeCheckout(planId);
    return { url: data.url ?? null };
  } catch (e: any) {
    return { url: null, error: e.message };
  }
}

export async function openPaymentBrowser(url: string): Promise<PaymentStatus> {
  try {
    if (Platform.OS === "web") {
      window.open(url, "_blank");
      return "pending";
    }
    const result = await WebBrowser.openBrowserAsync(url, {
      dismissButtonStyle: "cancel",
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    });
    if (result.type === "cancel" || result.type === "dismiss") return "cancelled";
    return "pending";
  } catch {
    if (Platform.OS !== "web") await Linking.openURL(url);
    return "pending";
  }
}
