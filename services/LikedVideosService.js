const { Account } = require('../models/Account');
const { verifyFields } = require('../utils/misc');
const { Token } = require('../models/Token');
const { LikedVideos } = require('../models/LikedVideos');

async function createLikedVideo(address, tokenId) {
  try {
    const existingLikedVideo = await LikedVideos.findOne({ address, tokenId });
    if (existingLikedVideo) {
      throw new Error('Video already liked');
    }
    const payload = new LikedVideos({
      address,
      tokenId,
    });

    await payload.save();
  } catch (error) {
    throw new Error(error.message);
  }
}

async function getLikedVideos(address, page = 1) {
  const skip = (page - 1) * 20;
  try {
    address = address.toLowerCase();
    // Will be limited later
    // const result = await LikedVideos.find({ address }).sort({ createdAt: -1 }).skip(skip).limit(20).populate('tokenId');
    const result = await LikedVideos.find({ address }).sort({ createdAt: -1 }).skip(skip).populate('tokenId');
    return result;
  } catch (error) {
    throw new Error(`Error getting liked videos: ${error.message}`);
  }
}

async function removeLikedVideos(likedId) {
  try {
    const liked = await LikedVideos.findById(likedId);
    if (liked) {
      return await LikedVideos.findByIdAndDelete(likedId);
    }

    throw new Error('Liked videos not found');
  } catch (error) {
    throw new Error(`Error removing Like videos: ${error.message}`);
  }
}

module.exports = {
  createLikedVideo,
  getLikedVideos,
  removeLikedVideos,
};
