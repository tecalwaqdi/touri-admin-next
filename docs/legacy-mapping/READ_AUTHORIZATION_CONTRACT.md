# READ_AUTHORIZATION_CONTRACT

## Authority

**Backend is the authority.** Client Firestore Rules are not sufficient for Admin Next API authorization.

## Forbidden APIs

- No generic `/api/read?collection=`
- No `firestore/query` passthrough
- Future APIs must be **resource-specific** (`/api/trips`, `/api/drivers`, …)

## Interface

```ts
interface ReadQuery<TFilter, TResult> {
  readonly resource: string;
  execute(input: {
    filter: TFilter;
    page: CursorPageRequest;
    maxPageSize: number;
  }): Promise<CursorPageResult<TResult>>;
}
```

## Pipeline (mandatory order)

1. Verify identity (token / AUTH_MODE)
2. Resolve role from verified claims
3. Resolve scope
4. Validate resource access (permission)
5. **Server-side scope filter**
6. Query (bounded)
7. Field redaction (PII + DO_NOT_EXPOSE_YET)
8. Return

**Never** query-all then filter in the browser.

## Pagination

- `limit` required
- `cursor` + `sort` + `filters` supported by contract
- `MAX_PAGE_SIZE` (default 100) — exceeding → reject
- Unbounded reads forbidden (tested)

## Rate-limit policy (design only)

| Surface | Budget |
|---|---|
| Lists | 60/min |
| Detail | 120/min |
| Search | 30/min |
| Exports | 5/hour |

No production gateway in Phase 3.7.

## Export

Requires `reports:export` + scope + sensitivity class check + row limit + audit event (design).

## Errors

`{ code, message, requestId, correlationId }` — never stacks, internal paths, Firebase internals, or claims dumps.

## Read safety levels

`SAFE | SAFE_WITH_WARNING | REDACTED | UNMAPPED | BLOCKED`

## Code

- `src/domain/read/ReadAuthorization.ts`
- `src/domain/read/ReadQuery.ts`
- `src/domain/read/ApiErrorContract.ts`
- `src/domain/read/ResourceReadSafety.ts`
