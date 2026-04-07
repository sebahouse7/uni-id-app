import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { apiCreateMercadoPagoCheckout } from "./apiClient";

export type PlanId = "basic" | "pro";
export type PaymentStatus = "success" | "failure" | "pending" | "cancelled";

export async function createMercadoPagoCheckout(
  planId: PlanId,
  _userId: string
): Promise<{ url: string | null; error?: string }> {
  try {
    // Always use a real HTTPS URL — MP back_urls must be HTTPS, deep links won't work
    const apiBase = process.env["EXPO_PUBLIC_API_URL"] ?? "https://expressjs-production-8bfc.up.railway.app/api";
    const backUrl = apiBase.replace(/\/api$/, "");
    const data = await apiCreateMercadoPagoCheckout(planId, backUrl);
    const url = data.initPoint ?? data.sandboxInitPoint ?? null;
    return { url };
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
