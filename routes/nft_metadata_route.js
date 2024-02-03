const { ethers } = require('ethers');
let express = require('express');
const fs = require('fs');
const path = require('path');
const { StreamController } = require('../controllers/StreamController');
let router = express.Router();

/**
 * @openapi
 * /nfts/nft_metadata/{tokenId}:
 *   get:
 *     summary: Fetches a video metadata
 *     tags: [Images, Videos]
 *     description: Public metadata for a particular token/video
 *     parameters:
 *        - name: tokenId
 *          in: path
 *          required: true
 *          description: Video ID
 *          schema:
 *            type: string
 *          example: "4"
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/nft_metadata/:id', async function (req, res, next) {
  return StreamController.getMetaData(req, res, next);
});

/**
 * @openapi
 * /nfts/images/{tokenId}:
 *   get:
 *     summary: Fetches a video thumbnail
 *     tags: [Images, Videos]
 *     description: Video thumbnail, width can be changed by adding 'w' in the parameters. It maintains it's aspect ratio
 *     parameters:
 *        - name: tokenId
 *          in: path
 *          required: true
 *          description: Video Id
 *          schema:
 *            type: string
 *          example: "4"
 *        - $ref: '#/parameters/imageWidthQueryParam'
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/images/:id', (req, res, next) => {
  StreamController.getImage(req, res, next);
});

module.exports = router;
