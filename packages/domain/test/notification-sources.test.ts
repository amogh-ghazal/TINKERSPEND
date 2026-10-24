import { describe, expect, it } from "vitest";
import { bankFromSmsHeader, isSupportedNotificationSource, reportedBank, parsePaymentNotification } from "../src";

describe("automatic notification source boundaries", () => {
  it("accepts supported apps and recognized bank SMS notifications, not arbitrary messages", () => {
    expect(isSupportedNotificationSource("com.phonepe.app", "Payment")).toBe(true);
    expect(isSupportedNotificationSource("com.google.android.apps.messaging", "VM-HDFCBK-S")).toBe(true);
    expect(isSupportedNotificationSource("com.android.mms", "AX-ICICIB")).toBe(true);
    for (const title of ["Rahul", "HDFC Bank offer", "VM-UNKNOWN", "HDFCBK spam", "+919876543210"]) {
      expect(isSupportedNotificationSource("com.google.android.apps.messaging", title)).toBe(false);
    }
    expect(isSupportedNotificationSource("com.whatsapp", "VM-HDFCBK")).toBe(false);
    expect(bankFromSmsHeader("VM-HDFCBK-S")).toBe("HDFC Bank");
  });
  it("reports an evidenced bank and leaves payment app names and conflicting banks unknown", () => {
    expect(reportedBank("com.phonepe.app", { text: "Paid Rs.100 to Metro Mart" })).toBeNull();
    expect(reportedBank("com.phonepe.app", { text: "Paid Rs.100 using HDFC Bank" })).toBe("HDFC Bank");
    expect(reportedBank("com.google.android.apps.messaging", { title: "VM-HDFCBK", text: "Rs.100 debited" })).toBe("HDFC Bank");
    expect(reportedBank("com.snapwork.hdfc", { text: "Transferred to ICICI Bank" })).toBeNull();
    expect(reportedBank("com.phonepe.app", { text: "Paid Rs.100 to HDFC Life" })).toBeNull();
  });
  it("keeps own-account credits out of income and normalizes only explicitly UPI UTR references", () => {
    expect(parsePaymentNotification({ text: "Rs.100 credited from own account. UPI UTR 512345678901" })).toMatchObject({ type: "payment", kindHint: "transfer", direction: "credit", reference: { namespace: "upi_ref", value: "512345678901" } });
    expect(parsePaymentNotification({ text: "Rs.100 credited from Employer. UTR 512345678901" })).toMatchObject({ type: "payment", kindHint: "income", reference: { namespace: "utr", value: "512345678901" } });
  });
});
