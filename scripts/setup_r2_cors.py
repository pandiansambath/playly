"""Configure CORS on the R2 bucket so the browser can fetch MP3s cross-origin
AND so WebAudio's MediaElementAudioSource doesn't emit zeroes.

Without this:
  - fetch('<r2-url>') from playly.online → CORS error
  - new MediaElementAudioSource(<audio cross-origin>) → outputs ZERO samples
    (audio plays "muted") because the browser can't verify CORS access.

After this script runs, R2 returns:
  Access-Control-Allow-Origin: <origin echoed back if matched>
  Access-Control-Allow-Methods: GET, HEAD
"""
import os
import boto3
from botocore.config import Config

ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "8c5d6c240f082caf6b158600b6cd4bc7")
BUCKET     = os.environ.get("R2_BUCKET", "playly-songs")

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    config=Config(signature_version="s3v4"),
    region_name="auto",
)

cors_config = {
    "CORSRules": [
        {
            "AllowedOrigins": [
                "https://playly.online",
                "https://www.playly.online",
                "http://localhost:3000",
                "http://localhost:8000",
            ],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedHeaders": ["*"],
            "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
            "MaxAgeSeconds": 86400,
        }
    ]
}

print(f"==> Setting CORS on R2 bucket '{BUCKET}'...")
r2.put_bucket_cors(Bucket=BUCKET, CORSConfiguration=cors_config)

# Verify
got = r2.get_bucket_cors(Bucket=BUCKET)
print("==> Done. Current CORS rules:")
for rule in got.get("CORSRules", []):
    print(f"   AllowedOrigins: {rule.get('AllowedOrigins')}")
    print(f"   AllowedMethods: {rule.get('AllowedMethods')}")
    print(f"   AllowedHeaders: {rule.get('AllowedHeaders')}")
    print(f"   ExposeHeaders:  {rule.get('ExposeHeaders')}")
    print(f"   MaxAgeSeconds:  {rule.get('MaxAgeSeconds')}")
