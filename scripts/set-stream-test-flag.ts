/*
 Toggle isTest flag for a LiveStream by _id.
 Usage (ts-node):
   npx ts-node scripts/set-stream-test-flag.ts <streamId> <true|false>
 Or build and run with node against compiled dist.
*/

import mongoose from 'mongoose';
import { config } from '../config';
import { LiveStreamSchema, StreamDocument } from '../models/LiveStream';

async function main() {
  const [,, streamId, flag] = process.argv;
  if (!streamId || (flag !== 'true' && flag !== 'false')) {
    console.error('Usage: ts-node scripts/set-stream-test-flag.ts <streamId> <true|false>');
    process.exit(1);
  }

  const isTest = flag === 'true';

  const mongoUri = `mongodb://${config.mongo.host}:${config.mongo.port}/${config.mongo.dbName}`;
  await mongoose.connect(mongoUri);

  const LiveStreamModel = mongoose.model<StreamDocument>('LiveStream', LiveStreamSchema);

  const res = await LiveStreamModel.findByIdAndUpdate(
    streamId,
    { $set: { isTest } },
    { new: true }
  ).lean();

  if (!res) {
    console.error('Stream not found');
    process.exit(2);
  }

  console.log(`Updated isTest for ${res._id}:`, res.isTest);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
