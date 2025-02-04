require('dotenv').config();

import { normalizeAddress } from 'common/util/format';

const isDevMode = process.env.RUN_MODE === 'dev';
const config = {
  port: process.env.API_PORT || 9015,
  socket: 9003,
  baseUrl: `http://127.0.0.1:${process.env.API_PORT || 9015}`,
  dirDmImages:  'dm-images',
  dirDmVideos:  'dm-videos',
  dirFeedsImages:  'feed-images',
  devPort: 9002,
  devBaseUrl: 'http://127.0.0.1:9002',
  mongo: {
    host: '127.0.0.1',
    port: 27017,
    dbName: process.env.DB_NAME || 'streaming_production_db',
  },
  redis: {
    host: 'localhost',
    port: 6379,
  },
  graphQlUrl: 'https://api.thegraph.com/subgraphs/name/streaming-nft/streaming-nft',
  expireSigninTime: isDevMode ? 2 : 24 * 60 * 60, // 2 hours
  isDevMode,
  recentTimeDiff: 45 * 24 * 60 * 60 * 1000,
  extraSecondForCheckingBalance: 2 * 60,
  extraPeriodForHistory: 60 * 1000, // in millisecond unit:  store into same watch history record while watching video in this extra time
  watchTimeForConfirming: 30 * 1000, // in millisecond unit, when user watches while more than 30 seconds, it is confirmed, got paid, and views is increased.
  availableTimeForPPVStream: 24 * 60 * 60 * 1000, // in millisecond unit, after user pay with token, the stream is unlocked for the user while this time
  developerFee: 0.1, // developer fee for pay per view is 10 %
  defaultChainId: isDevMode ? 97 : 56,
  defaultTokenSymbol: 'DHB',
  rangeOfTip: { min: 1, max: 1_000_000_000 },
  devWalletAddress: normalizeAddress(process.env.DEV_ADDRESS),
  votesForDeleting: 1000,
  totalStakedForDeleting: 50_000_0000,
  periodOfDeleleCron: 600, // per 10 min, check and delete voted streams
  blockLimitsForFetching: isDevMode ? 5000 : 1000, // fetch blockchain data in a range of this block using graphql
  itemLimitsForFetching: 500, // count of max items that are fetched
};
export { config };
