import SharedGigOverviewPage from "@/components/SharedGigOverviewPage";

export default function ShareTokenPage({
  params,
}: {
  params: { token: string };
}) {
  return <SharedGigOverviewPage token={params.token} />;
}
