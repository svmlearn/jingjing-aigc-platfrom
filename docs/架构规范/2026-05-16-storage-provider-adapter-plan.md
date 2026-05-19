# 2026-05-16 Storage Provider Adapter Plan

## Purpose

This is a design-only plan for introducing an object storage provider adapter so the current Tencent COS implementation can later support Aliyun OSS without rewriting product, worker, and preview flows.

No Aliyun OSS code was implemented in this round. No Aliyun OSS smoke was run.

## Current Tencent COS Touchpoints

App side:

- `app/src/server/api/cos.ts`
  - reads `COS_SECRET_ID`, `COS_SECRET_KEY`, `COS_BUCKET`, `COS_REGION`
  - issues STS upload credentials
  - builds object keys
  - uploads knowledge source objects
  - creates signed preview URLs
- `app/src/server/api/media-service.ts`
  - `/api/media/upload-intents`
  - `/api/media/complete`
  - validates upload owner and expected COS key prefix
- `app/src/lib/db/media-repository.ts`
  - writes `asset_objects.storage_provider`, `bucket_name`, `storage_key`
- `app/src/server/api/video-edit-jobs-service.ts`
  - attaches stable result asset URLs
  - re-signs Tencent COS result URLs in `/api/video-edit-jobs/[id]/result/[assetId]`
- `app/src/app/api/media/cos-preview/route.ts`
  - redirects existing COS paths to signed GET URLs
- `app/src/server/api/knowledge-service.ts`
  - uploads knowledge files to Tencent COS through `putCosObject`

Frontend side:

- `app/src/lib/ui/video-workflow.ts`
  - loads `cos-js-sdk-v5`
  - uploads browser media using Tencent COS temporary credentials

Worker side:

- `workers/video-worker/worker/app/cos_client.py`
  - `TencentCosClient.download_file`
  - `TencentCosClient.upload_file`
- `workers/video-worker/worker/app/models.py`
  - currently rejects input assets whose `storage_provider` is not `tencent_cos`
- `workers/video-worker/worker/app/processor.py`
  - downloads input media
  - uploads `final.mp4`, cover, subtitle outputs
  - builds output object keys from `WORKER_COS_RESULT_PREFIX`
- `workers/video-worker/worker/app/db.py`
  - inserts output `asset_objects` with `storage_provider = 'tencent_cos'`

Scripts and deploy:

- `app/scripts/check-domestic-cos-roundtrip.mjs`
- `app/scripts/check-domestic-video-chain-api-smoke.mjs`
- `app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- `deploy/domestic/env/app.env.example`
- `deploy/domestic/env/worker.env.example`
- `workers/video-worker/.env.example`
- `workers/video-worker/docker-compose.yml`

## Target Provider Interface

App TypeScript interface:

```ts
type StorageProviderName = "tencent_cos" | "aliyun_oss";

type ObjectRef = {
  provider: StorageProviderName;
  bucketName: string;
  region?: string | null;
  endpoint?: string | null;
  storageKey: string;
};

type BrowserUploadIntent = {
  provider: StorageProviderName;
  bucket: string;
  region?: string | null;
  endpoint?: string | null;
  key: string;
  credentials: Record<string, string | number>;
};

interface ObjectStorageProvider {
  readonly provider: StorageProviderName;
  buildUploadKey(input: {
    merchantId: string;
    ownerType: "source_item" | "content_draft";
    ownerId: string;
    fileName: string;
  }): string;
  issueUploadCredentials(input: { storageKey: string }): Promise<BrowserUploadIntent>;
  putObject(input: {
    storageKey: string;
    body: Buffer;
    contentType?: string | null;
  }): Promise<ObjectRef & { etag?: string | null }>;
  createSignedReadUrl(input: ObjectRef & { expiresInSeconds?: number }): string;
  assertWritableObjectRef(input: ObjectRef): void;
}
```

Worker Python interface:

```py
class ObjectStorageClient(Protocol):
    provider: str

    def download_file(
        self,
        storage_key: str,
        destination: Path,
        bucket_name: str | None = None,
        endpoint: str | None = None,
    ) -> Path: ...

    def upload_file(
        self,
        local_path: Path,
        storage_key: str,
        asset_type: str,
        bucket_name: str | None = None,
        endpoint: str | None = None,
    ) -> UploadedAsset: ...
```

Factory:

- app: `getStorageProvider()` reads `STORAGE_PROVIDER`, defaulting to `tencent_cos` until migration.
- worker: `get_storage_client(settings, provider)` selects Tencent COS or Aliyun OSS based on job asset provider or worker default.

## Environment Variables

App:

- `STORAGE_PROVIDER=tencent_cos|aliyun_oss`
- existing Tencent COS:
  - `COS_SECRET_ID`
  - `COS_SECRET_KEY`
  - `COS_BUCKET`
  - `COS_REGION`
  - `COS_STS_DURATION_SECONDS`
  - `COS_READ_URL_TTL_SECONDS`
- Aliyun OSS target:
  - `ALIYUN_OSS_ACCESS_KEY_ID`
  - `ALIYUN_OSS_ACCESS_KEY_SECRET`
  - `ALIYUN_OSS_BUCKET`
  - `ALIYUN_OSS_REGION`
  - `ALIYUN_OSS_ENDPOINT`
  - `ALIYUN_OSS_STS_ROLE_ARN`
  - `ALIYUN_OSS_STS_DURATION_SECONDS`
  - `ALIYUN_OSS_READ_URL_TTL_SECONDS`

Worker:

- `WORKER_STORAGE_PROVIDER=tencent_cos|aliyun_oss`
- existing Tencent COS:
  - `WORKER_COS_SECRET_ID`
  - `WORKER_COS_SECRET_KEY`
  - `WORKER_COS_BUCKET`
  - `WORKER_COS_REGION`
  - `WORKER_COS_RESULT_PREFIX`
- Aliyun OSS target:
  - `WORKER_OSS_ACCESS_KEY_ID`
  - `WORKER_OSS_ACCESS_KEY_SECRET`
  - `WORKER_OSS_BUCKET`
  - `WORKER_OSS_REGION`
  - `WORKER_OSS_ENDPOINT`
  - `WORKER_OSS_RESULT_PREFIX`

Compatibility rule:

- `COS_*` can remain for Tencent fallback.
- Do not overload `COS_*` with Aliyun values.
- Do not make `WORKER_COS_*` mean generic storage.

## Database Contract

Current reusable fields:

- `asset_objects.storage_provider`
- `asset_objects.bucket_name`
- `asset_objects.storage_key`
- `knowledge_documents.storage_provider`
- `knowledge_documents.bucket_name`
- `knowledge_documents.storage_key`

Required expansion:

1. Extend allowed provider values:
   - keep legacy `supabase_storage`
   - keep `tencent_cos`
   - add `aliyun_oss`
2. Add optional metadata if needed:
   - `storage_region text`
   - `storage_endpoint text`
   - or a generic `storage_metadata jsonb not null default '{}'::jsonb`
3. Update TypeScript contracts:
   - `MediaStorageProvider = "tencent_cos" | "aliyun_oss" | "supabase_storage"`
   - knowledge document storage provider union
4. Update worker output asset insert:
   - write provider selected by worker, not hard-coded `tencent_cos`.
5. Update input asset payload builder:
   - include `storage_provider`, `bucket_name`, `storage_key`, and optional `endpoint/region`.

## Migration Phases

### Phase 0: Adapter shell only

- Introduce provider interfaces and factories.
- Keep default provider `tencent_cos`.
- No behavior change.
- Existing Tencent COS tests must pass unchanged.

### Phase 1: App Aliyun upload intent

- Add Aliyun STS credential issuing.
- Update `/api/media/upload-intents` response shape to expose provider and provider-specific credentials.
- Update browser upload code to load COS SDK or OSS SDK based on provider.
- Keep `/api/media/complete` provider validation strict.

### Phase 2: Preview/read URLs

- Route result preview through generic signed read URL.
- Rename `cos-preview` or add a provider-neutral preview route.
- Keep old route for backward compatibility until old assets expire.

### Phase 3: Worker storage client

- Add `AliyunOssClient`.
- Allow input assets with `storage_provider=aliyun_oss`.
- Select output provider by `WORKER_STORAGE_PROVIDER`.
- Persist output `asset_objects.storage_provider` from uploaded asset.

### Phase 4: Knowledge files

- Route knowledge file upload through generic provider.
- Include provider in knowledge ingestion metadata.
- Keep text memory path storage-free.

### Phase 5: Removal / cleanup

- Only after all new writes use the adapter, evaluate deprecating Tencent-specific env and UI naming.
- Do not delete old Tencent read support while Tencent assets still exist.

## Test Plan

Unit tests:

- app storage provider factory rejects incomplete env.
- object key generation remains stable.
- `/api/media/complete` rejects mismatched bucket/provider.
- video job payload includes provider fields.
- worker model accepts `aliyun_oss` after implementation and still rejects unsupported providers.
- worker output insert writes selected provider.

Integration smokes:

- Tencent COS existing:
  - app env check
  - COS roundtrip
  - video API smoke
  - worker fast path
  - normal no-voiceover path
- Aliyun OSS new:
  - OSS roundtrip
  - browser upload intent shape
  - `/api/media/complete`
  - worker input download
  - worker output upload
  - preview signed read

Regression gates:

- No real secrets in docs or committed env files.
- No switch to Aliyun by default until env and smoke pass.
- No claim that Tencent COS validation implies Aliyun OSS validation.

## Non-goals For This Round

- No Aliyun OSS implementation.
- No bucket creation.
- No CORS/STS policy mutation.
- No data backfill from Tencent COS to Aliyun OSS.
- No domain or ICP change.
