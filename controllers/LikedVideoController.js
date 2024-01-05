const { paramNames } = require('../config/constants');
const likedVideoService = require('../services/LikedVideosService');
const { reqParam } = require('../utils/auth');

const LikedVideosController = {
  create: async function (req, res, next) {
    try {
      const { userId, type, content } = req.body;
      await likedVideoService.createLikedVideo(userId, type, content);
      res.status(200).json({ message: 'Video added to liked videos' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  get: async function (req, res, next) {
    try {
      const address = reqParam(req, paramNames.address);
      const page = reqParam(req, 'page');
      const result = await likedVideoService.getLikedVideos(address, page);
      res.status(200).json({ result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  remove: async function (req, res, next) {
    try {
      const id = req.params.id;
      await likedVideoService.removeLikedVideos(id);
      res.status(200).json({ message: 'Liked Video deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = LikedVideosController;
