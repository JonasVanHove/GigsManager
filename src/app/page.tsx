import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";
import { ToastProvider } from "@/components/ToastContainer";

export default function Home() {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
    </ToastProvider>
  );
}
