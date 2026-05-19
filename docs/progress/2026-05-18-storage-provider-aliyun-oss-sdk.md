# 2026-05-18 Storage Provider Aliyun OSS SDK

## Scope

Batch 9B wires the app-side `aliyun_oss` storage provider to the real Aliyun OSS JavaScript SDK while keeping `tencent_cos` as the default provider.

Implemented:

- Added real app dependency `ali-oss` for server-side OSS operations.
- Added `@types/ali-oss` for TypeScript coverage.
- Added `proxy-agent` because `ali-oss -> urllib` has an optional peer that Turbopack resolves during `next build`.
- Implemented Aliyun OSS server object upload through `putObject()`.
- Implemented Aliyun OSS signed read URL through `createSignedReadUrl()`.
- Implemented Aliyun browser direct upload intent using a server-signed PUT URL.
- Extended frontend upload flow to dispatch between Tencent COS SDK upload and Aliyun signed PUT upload.
- Kept Tencent COS as the default runtime provider.

Explicitly out of scope and not touched:

- worker storage client
- worker/TTS/FireRed/OpenStoryline
- Tencent COS to Aliyun OSS backfill
- bucket creation, CORS mutation, or RAM policy mutation
- main merge
- completion marker

## SDK Packages

Installed in `app/package.json`:

```text
ali-oss: ^6.23.0
@types/ali-oss: ^6.23.3
proxy-agent: ^5.0.0
```

`proxy-agent` is included only to satisfy the `urllib` optional peer that is statically resolved by the Next.js/Turbopack production build.

## Provider Methods Implemented

`app/src/server/storage/aliyun-oss-provider.ts` now implements:

```text
issueBrowserUploadIntent(input)
putObject(input)
createSignedReadUrl(input)
assertWritableObjectRef(input)
```

Implemented behavior:

- `putObject()` creates an `ali-oss` client and uploads a `Buffer` body with the input content type.
- `createSignedReadUrl()` generates a signed GET URL and respects explicit `expiresInSeconds` or `ALIYUN_OSS_READ_URL_TTL_SECONDS`.
- `issueBrowserUploadIntent()` returns provider-neutral browser upload fields:
  - `provider: aliyun_oss`
  - `bucket`
  - `region`
  - `endpoint`
  - `storageKey`
  - `uploadKey`
  - `uploadUrl`
  - `uploadMethod: PUT`
  - `uploadHeaders`
  - `expiresAt`
  - `expiredTime`

## Browser Upload Method

Chosen method:

```text
signed_put_url
```

Reason:

- It is smaller than adding a full browser OSS SDK path.
- It does not require an STS role for Batch 9B.
- It keeps the app adapter provider-neutral and matches the current media upload intent shape.

Required bucket CORS before real browser use:

```text
AllowedMethod: PUT
AllowedHeader: Content-Type
ExposeHeader: ETag
```

If `ETag` is not exposed by CORS, the upload can still complete, but the browser cannot read the response ETag and will fall back to a local deterministic value.

## Env Split

Required for Aliyun OSS server put, signed read URL, and signed PUT upload intent:

```text
ALIYUN_OSS_ACCESS_KEY_ID
ALIYUN_OSS_ACCESS_KEY_SECRET
ALIYUN_OSS_BUCKET
ALIYUN_OSS_REGION
ALIYUN_OSS_ENDPOINT
```

Optional / future STS flow only:

```text
ALIYUN_OSS_STS_ROLE_ARN
ALIYUN_OSS_STS_DURATION_SECONDS
```

Still supported:

```text
ALIYUN_OSS_READ_URL_TTL_SECONDS
MEDIA_UPLOAD_MAX_BYTES
```

`ALIYUN_OSS_STS_ROLE_ARN` no longer blocks app-side server upload, signed read URL, or signed PUT upload intent.

## Local Validation

Static/build checks:

```text
node --check app/scripts/check-domestic-storage-provider-smoke.mjs: passed
node --check app/scripts/check-domestic-app-env.mjs: passed
pnpm --dir app typecheck: passed
pnpm --dir app lint: passed
pnpm --dir app build: passed
git diff --check: passed
```

Build note:

```text
Initial build failed because proxy-agent was missing from ali-oss/urllib's optional dependency path.
After adding proxy-agent@^5.0.0, pnpm --dir app build passed.
```

Tencent COS adapter regression with dummy env:

```text
command: COS_SECRET_ID=dummy COS_SECRET_KEY=dummy COS_BUCKET=jj-healthcheck-1250000000 COS_REGION=ap-guangzhou STORAGE_PROVIDER=tencent_cos node app/scripts/check-domestic-storage-provider-smoke.mjs --provider tencent_cos
result: status=ok, signedReadUrlGenerated=true, roundtrip=skipped
```

Aliyun OSS without real env:

```text
command: STORAGE_PROVIDER=aliyun_oss node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss
result: status=pending, code=OSS_NOT_CONFIGURED, missing required Aliyun server env, roundtrip=pending
```

Aliyun OSS roundtrip without real env:

```text
command: STORAGE_PROVIDER=aliyun_oss node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss --roundtrip
result: status=missing_environment, code=OSS_NOT_CONFIGURED, exit code 2
```

Real Aliyun OSS roundtrip:

```text
status: pending
reason: no real Aliyun OSS env was available in this batch
```

No Aliyun access keys or secrets were printed in validation output.

## Singapore Validation

Singapore live health:

```text
GET http://43.160.208.189/api/health
ok=true
database.provider=postgres
cos.status=configured
cos.bucket=jj-content-staging-1341668543
cos.region=ap-singapore
```

Singapore running app container, real Tencent COS roundtrip:

```text
command: sudo docker exec jingjing-selfhost-app sh -lc "cd /app && node scripts/check-domestic-cos-roundtrip.mjs --prefix batch9b/tencent-cos-regression"
result: status=ok, signedDownloadStatus=200, signedDownloadMatched=true, deleted=true
```

Singapore PostgreSQL preflight through SSH tunnel:

```text
check-domestic-app-env.mjs: status=ok, database connected, required tables present
```

Singapore DB non-regression through SSH tunnel:

```text
check-domestic-merchant-credits-usage-smoke.mjs: status=ok
check-domestic-material-library-smoke.mjs: status=ok
```

Singapore Aliyun OSS:

```text
status: pending
reason: Singapore environment does not have real Aliyun OSS env for this batch
```

## Backup / Push State

Before editing, the requested pre-work backup was pushed:

```text
gitee/codex/domestic-infra-migration = 5e9218ceeb6bbbe527fe15eee5ae33522a4ecb8d
```

The Batch 9B implementation commit is local until explicitly pushed later.

## Remaining Risks

- Real Aliyun OSS put/read/delete is not proven until the real Aliyun env is supplied.
- Real browser upload needs OSS bucket CORS to allow signed PUT uploads with `Content-Type` and expose `ETag`.
- Signed PUT upload currently reports browser progress only at start and completion because `fetch` does not expose upload progress.
- Worker storage still accepts Tencent COS only and must stay separate until a dedicated worker batch.
- Production/default provider remains `tencent_cos`; switching to `aliyun_oss` should wait for real Aliyun roundtrip evidence.
