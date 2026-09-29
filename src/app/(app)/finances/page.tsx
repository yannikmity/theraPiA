import { FinancesClient } from "./FinancesClient";
import { requireSession } from "@/lib/require-session";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loadFinancesData } from "./actions";

export default async function FinancesPage() {
  await requireSession();
  const data = await loadFinancesData();

  return (
    <ErrorBoundary>
      <FinancesClient
        initialSettings={data.settings}
        initialSupervisors={data.supervisors}
        initialQuarters={data.quarters}
        initialTotalIncome={data.totalIncome}
        initialTotalCosts={data.totalCosts}
        expenseYears={data.expenseYears}
      />
    </ErrorBoundary>
  );
}
