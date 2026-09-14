import { AdminShell } from "@/components/layout/AdminShell";
import { buildFixtureMappingHealth } from "@/domain/read/MappingHealth";

export const dynamic = "force-dynamic";

/**
 * Phase 3.7 mapping health — fixtures only.
 * Does not connect to Production Firebase.
 */
export default function MappingHealthPage() {
  const health = buildFixtureMappingHealth();

  return (
    <AdminShell title="Mapping Health">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">Admin Next Mapping Health</h1>
        <p className="text-sm opacity-80">
          Fixtures only — Production Read disabled. No live Firestore.
        </p>
        <pre className="overflow-auto rounded border border-black/10 bg-black/5 p-4 text-xs">
          {JSON.stringify(health, null, 2)}
        </pre>
      </div>
    </AdminShell>
  );
}
