"use client";

import { useEffect } from "react";
import { useToast } from "./ToastContainer";
import { consumeDemoLoginPending, DEMO_LOGIN_MESSAGE } from "@/lib/demo-account";

/**
 * Shows the "Injelogd op de demo-omgeving" banner once after /demo redirected
 * the visitor into the dashboard. Mounted inside <ToastProvider>.
 */
export default function DemoLoginNotice() {
  const { success } = useToast();

  useEffect(() => {
    if (consumeDemoLoginPending()) {
      success(DEMO_LOGIN_MESSAGE);
    }
  }, [success]);

  return null;
}