import { S3Client, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../config";

const client = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  credentials: {
    accessKeyId: String(config.s3.accessKeyId || ""),
    secretAccessKey: String(config.s3.secretAccessKey || ""),
  },
});

const bucket = String(config.s3.bucket || "");
const folders = ["avatars/", "covers/"];
const newCacheControl = "public, max-age=3600, must-revalidate";

// Grab CLI argument
const args = process.argv.slice(2);
const testAddress = args.includes("--test")
  ? args[args.indexOf("--test") + 1]
  : null;

console.log("🚀 Starting cache control update script", {
  bucket,
  testAddress,
});

async function updateCacheForSingle(address: string) {
  const targets = [`avatars/${address}.jpg`, `covers/${address}.jpg`];

  for (const key of targets) {
    console.log(`🎯 Updating cache for: ${key}`);

    try {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${key}`,
          Key: key,
          MetadataDirective: "REPLACE",
          CacheControl: newCacheControl,
          ACL: "public-read",
        })
      );

      console.log(`✅ Successfully updated: ${key}`);
    } catch (error: any) {
      console.error(`❌ Failed for ${key}: ${error.message}`);
    }
  }
}

async function updateCacheControl(prefix: string) {
  console.log(`🔍 Checking files under: ${prefix}`);

  const list = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );

  if (!list.Contents?.length) {
    console.log("No files found.");
    return;
  }

  for (const obj of list.Contents) {
    if (!obj.Key) continue;

    console.log(`Updating cache for: ${obj.Key}`);

    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${obj.Key}`,
        Key: obj.Key,
        MetadataDirective: "REPLACE",
        CacheControl: newCacheControl,
        ACL: "public-read",
      })
    );
  }

  console.log(`✅ Updated cache control for ${list.Contents.length} files in ${prefix}`);
}

(async () => {
  if (testAddress) {
    console.log(`🧪 Running in test mode for address: ${testAddress}`);
    await updateCacheForSingle(testAddress);
  } else {
    for (const folder of folders) {
      await updateCacheControl(folder);
    }
  }

  console.log("🎉 Done updating cache control.");
})();
