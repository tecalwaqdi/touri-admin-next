# Legacy Findings (read-only)

Observed while inspecting Legacy for Phase 0 — **not modified**:

1. Legacy Admin is FlutterFlow-style Flutter web (`admin_arawatan`) with Firebase hosting under `admin/Admi/firebase/hosting_public`.
2. Multiple Firebase `firebase.json` files exist (admin, customer app, driver app, payment-api) — production surface is larger than a single admin panel.
3. Production storage bucket name appears in Legacy `firebase.json` (do not reuse in Admin Next).
4. Repo root `package-lock.json` is nearly empty / unused for the Flutter monorepo — tooling is split per subproject.
5. Pre-existing dirty Legacy working tree included hosting build artifacts and geo alias work unrelated to Admin Next.
6. Phase 2 read-only note: Legacy financial / settlement formulas are not documented as a single canonical domain module — Admin Next therefore uses an explicitly synthetic policy (`SYNTHETIC_TEST_POLICY`) rather than reverse-engineering production math.

No Legacy bugs were fixed. Any remediation belongs to a separate Legacy-approved track.
