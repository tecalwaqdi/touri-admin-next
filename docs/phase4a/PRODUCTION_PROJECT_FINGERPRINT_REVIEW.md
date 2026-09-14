# PRODUCTION_PROJECT_FINGERPRINT_REVIEW

**Phase:** 4A-1  
**Extraction date:** 2026-09-11  
**Method:** Read-only Legacy config sources under `/Users/ventura/ara-ban` (no Firebase service network calls).  
**Secret policy:** No API keys, OAuth client secrets, or private keys extracted or stored.

---

## Extracted fingerprint (from Legacy configs)

| Field | Value | Sources (consistent) |
|---|---|---|
| **Project ID** | `tutorial-multi-language-70gx4j` | `.firebaserc` (Admi, ara_oatan_app, mndob, payment-api, Admi/firebase); Android `google-services.json`; iOS `GoogleService-Info.plist` |
| **Project number / GCM sender** | `638010533068` | google-services / GoogleService-Info |
| **Firestore database** | **Default** (not explicitly named `(default)` elsewhere; no named DB in firebase.json) | `firebase.json` → `firestore.rules` / indexes only |
| **Auth project** | Same as Project ID (`tutorial-multi-language-70gx4j`) | Client configs; no separate Auth project id found |
| **Storage bucket** | `tutorial-multi-language-70gx4j.firebasestorage.app` | firebase.json storage.bucket; google-services `storage_bucket`; iOS `STORAGE_BUCKET` |
| **Functions region** | `us-central1` | `admin/Admi/firebase/functions/index.js` (`functions.region('us-central1')` patterns) |

### Secondary / ambiguous Legacy target (NOT assumed Production)

| Field | Value | Source |
|---|---|---|
| Storage hosting target alias | `demo-touri-taxi` → bucket `demo-touri-taxi.appspot.com` | `admin/ara_oatan_app/firebase/.firebaserc` `targets` |

This alias **must not** be used as `EXPECTED_PROJECT_ID` unless a human operator explicitly confirms it is the Production Touri Taxi Firebase project (evidence suggests it is a secondary storage target / demo alias).

---

## EXPECTED_PROJECT_ID human confirmation (REQUIRED)

> **CRITICAL:** Folder names, FlutterFlow tutorial-looking project ids, and `.firebaserc` `default` alone are **not** sufficient proof that the project is the real **Production Touri Taxi** live system.

| Check | Status |
|---|---|
| Candidate Project ID from Legacy configs | `tutorial-multi-language-70gx4j` |
| Human operator confirms this **is** Production Touri Taxi | **CONFIRMED** (operator, 2026-09-11) — Project Number `638010533068` |
| Human operator confirms Storage/Auth/Functions above match Production | **CONFIRMED** (aligned with Legacy fingerprint table) |
| Human rejects `demo-touri-taxi` as Production project id | **CONFIRMED** — do not use as `EXPECTED_PROJECT_ID` |

**Live connection may proceed only with dedicated Shadow SA + ADC impersonation + verified-token Auth (no JSON keys).**

---

## Recommended Admin Next env (after human confirm only)

```bash
EXPECTED_PROJECT_ID=<human-confirmed-production-project-id>
EXPECTED_ENVIRONMENT=production
```

Do **not** copy a project id from chat history or invent one. Operator sets local env / Secret Manager outside git.

---

## What was intentionally not extracted

- Android/iOS API keys
- OAuth client secrets
- Any `private_key` / service account JSON
- Runtime Firestore document samples
