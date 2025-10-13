/*
 Soft-delete streams by their tokenId values (set isDeleted=true).
 Usage:
   pnpm soft-delete-streams -- 123 456 789
 or
   npx ts-node -r tsconfig-paths/register scripts/soft-delete-streams-by-tokenId.ts 123 456 789
*/
import mongoose from 'mongoose';
import { config } from '../config';
import { LiveStreamSchema, StreamDocument } from '../models/LiveStream';

async function main() {
  const tokenIds = process.argv.slice(2).map(v => Number(v)).filter(v => Number.isFinite(v));
  if (tokenIds.length === 0) {
    console.error('Provide one or more numeric tokenId values');
    process.exit(1);
  }

  const mongoUri = `mongodb://${config.mongo.host}:${config.mongo.port}/${config.mongo.dbName}`;
  await mongoose.connect(mongoUri);

  const LiveStreamModel = mongoose.model<StreamDocument>('LiveStream', LiveStreamSchema);

  const res = await LiveStreamModel.updateMany(
    { tokenId: { $in: tokenIds } },
    { $set: { isDeleted: true } }
  );

  console.log(`Soft-deleted ${res.modifiedCount} stream(s) by tokenId.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
