import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

export const PAYPAL_EMPRESA_URL = "https://www.paypal.com/ncp/payment/7PFQRRDFMF58J";

export type PaymentStatus = "success" | "failure" | "pending" | "cancelled";

export async function openPayPalCheckout(): Promise<PaymentStatus> {
  const url = PAYPAL_EMPRESA_URL;
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
    try {
      await Linking.openURL(url);
    } catch {
    }
    return "pending";
  }
}
