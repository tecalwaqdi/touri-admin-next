# Legacy Protection

## Protected Legacy

Path: `/Users/ventura/ara-ban` (and all nested admin / client / driver / Firebase production assets).

Confirmed Legacy characteristics (read-only inspection):

- Flutter Admin (`admin/Admi`, package `admin_arawatan`)
- Customer app (`admin/ara_oatan_app`)
- Driver / agent app (`admin/mndob-main`)
- Firebase hosting + functions under `admin/Admi/firebase`
- Production storage bucket referenced in `firebase.json`

## Forbidden operations

Admin Next (this repo) and its agents MUST NOT:

- Modify any file under Legacy
- Deploy Legacy hosting
- Change Production Firestore / Auth / Functions / Rules / Indexes
- Reuse Production secrets in development
- Run Production migrations

## Isolation guarantee

- Separate directory: `/Users/ventura/touri-admin-next`
- Separate `.git`
- Separate `package.json` / lockfile / env / deploy config
- If Admin Next fails, disable Admin Next only — Legacy keeps running

## Baseline note

At Phase 0 creation time, Legacy git already had unrelated dirty files (hosting build artifacts, geo alias work). Those were **not** introduced by Admin Next and must not be touched.
