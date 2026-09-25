import { Suspense } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { MarketingLandingPage } from "@/components/MarketingLandingPage";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <LoadingSpinner size="lg" message="Loading..." />
        </div>
      }
    >
      <MarketingLandingPage />
    </Suspense>
  );
}
