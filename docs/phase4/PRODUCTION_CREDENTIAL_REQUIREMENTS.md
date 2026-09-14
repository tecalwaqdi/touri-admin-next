# PRODUCTION_CREDENTIAL_REQUIREMENTS

**NO real credentials in this phase. DO NOT commit secrets.**

## Principles

| Requirement | Design |
|---|---|
| Least privilege | Dedicated **read-only** identity if feasible (Firestore read on allowlisted collections only) |
| Separation | Separate from Legacy deploy SA, developer keys, and any write identity |
| Secret Manager | Store JSON / workload identity in SM; inject at runtime; never repo / `.env` committed |
| Rotation | Documented rotation owner + interval; invalidate on kill |
| Env separation | Dev/staging must not load Production credential; fingerprint mismatch FAIL |
| Access audit | Who can read the secret; break-glass logged |
| Admin SDK | Only behind multi-gate + `AUTH_MODE=verified_token` |
| Browser | No Firebase client SDK to Production Firestore from Admin Next |

## Planned secret refs (placeholders)

- `sm://admin-next/production-read-verifier` — token verification  
- `sm://admin-next/production-read-firestore` — optional separate data reader  

## Forbidden

- Committing service account JSON  
- Reusing Legacy Cloud Functions deploy credentials for Admin Next read  
- Testing Production ID tokens against live users in Phase 4 design  
