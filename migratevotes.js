const mongoose = require('mongoose');
const Vote = require('./models/Vote');
const { LikedVideos } = require('./models/LikedVideos');
const { Token } = require('./models/Token');
const { config } = require('./config');

mongoose.connect('mongodb://' + config.mongo.host + ':' + config.mongo.port + '/' + config.mongo.dbName, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}); // Replace with your MongoDB URI

async function createLikedVideo(address, tokenId) {
  try {
    const existingLikedVideo = await LikedVideos.findOne({ address, tokenId });
    if (existingLikedVideo) {
      console.log(`Video already liked for address: ${address}, tokenId: ${tokenId}`);
      return;
    }

    const payload = new LikedVideos({
      address,
      tokenId,
    });

    await payload.save();
    console.log(`Liked video created for address: ${address}, tokenId: ${tokenId}`);
  } catch (error) {
    console.error('Error creating liked video:', error.message);
  }
}

async function processVotes() {
  try {
    const votes = await Vote.find({ vote: true });

    for (const vote of votes) {
      // Fetch token information based on the vote
      const tokenInfo = await Token.findOne({ tokenId: vote.tokenId }, {}).lean();

      if (tokenInfo) {
        // Call the createLikedVideo function with token information
        await createLikedVideo(vote.address, tokenInfo._id);
      }
    }
  } catch (error) {
    console.error('Error processing votes:', error.message);
  } finally {
    mongoose.connection.close(); // Close the connection when done
  }
}

processVotes();
