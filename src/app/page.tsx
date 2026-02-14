import Dashboard from "@/components/Dashboard";
import { ToastProvider } from "@/components/ToastContainer";

export default function Home() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}
