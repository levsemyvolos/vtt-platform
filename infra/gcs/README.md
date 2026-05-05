# GCS Bucket Configuration

## Security model (§2.16)

Asset access pattern: **server-side streaming proxy**.

- The client never holds a presigned URL or a signed URL to storage.googleapis.com.
- The bucket is **fully private**; no public access of any kind.
- All asset bytes flow through the server with JWT authentication:
  - Upload: `POST /api/assets` (multipart, multer, RBAC checked server-side)
  - Download: `GET /api/assets/:id/file` (stream via `createReadStream`, RBAC checked)

## Required bucket settings (one-time, manual)

Apply once per environment via `gcloud` or GCP Console. No CORS configuration is needed or desired.

```bash
# Uniform Bucket-Level Access (disable legacy ACLs)
gcloud storage buckets update gs://<BUCKET_NAME> --uniform-bucket-level-access

# Public access prevention (block all public access)
gcloud storage buckets update gs://<BUCKET_NAME> --public-access-prevention=enforced
```

## IAM — minimum required

Only the server's service account needs access:

```bash
gcloud storage buckets add-iam-policy-binding gs://<BUCKET_NAME> \
  --member="serviceAccount:<SERVER_SA>@<PROJECT>.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

## CORS

**Do NOT configure CORS on the bucket.** The server-side proxy makes all access same-origin
from the browser's perspective (all requests go to the Vercel `/api/*` rewrite → Render server).
Adding CORS would widen the attack surface without benefit.

## Environment variables

| Variable | Description |
|---|---|
| `GCS_PROJECT_ID` | GCP project ID |
| `GCS_BUCKET_NAME` | Bucket name |
| `GCS_SERVICE_ACCOUNT_KEY` | Base64-encoded service account JSON key |
