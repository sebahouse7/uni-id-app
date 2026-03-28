import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getLocales } from "expo-localization";
import { Platform } from "react-native";

const API_BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}/api-server/api`
  : "http://localhost:8080/api";

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
    const res = await fetch(`${API_BASE}/subscriptions/status`);
    if (!res.ok) return { mercadopago: false, stripe: false };
    return res.json();
  } catch {
    return { mercadopago: false, stripe: false };
  }
}

export async function createMercadoPagoCheckout(
  planId: PlanId,
  userId: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const backUrl = Linking.createURL("payment-result");
    const res = await fetch(`${API_BASE}/subscriptions/mercadopago/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, userId, backUrl }),
    });
    const data = await res.json();
    if (!res.ok) return { url: null, error: data.error };
    return { url: data.initPoint ?? data.sandboxInitPoint };
  } catch (e: any) {
    return { url: null, error: e.message };
  }
}

export async function createStripeCheckout(
  planId: PlanId,
  userId: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/subscriptions/stripe/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, userId }),
    });
    const data = await res.json();
    if (!res.ok) return { url: null, error: data.error };
    return { url: data.url };
  } catch (e: any) {
    return { url: null, error: e.message };
  }
}

export async function openPaymentBrowser(url: string): Promise<PaymentStatus> {
  try {
    const result = await WebBrowser.openBrowserAsync(url, {
      dismissButtonStyle: "cancel",
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    });
    if (result.type === "cancel" || result.type === "dismiss") {
      return "cancelled";
    }
    return "pending";
  } catch {
    if (Platform.OS !== "web") {
      await Linking.openURL(url);
    }
    return "pending";
  }
}
