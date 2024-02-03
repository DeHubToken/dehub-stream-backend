const { ethers } = require('ethers');
let express = require('express');
const fs = require('fs');
const path = require('path');
const { StreamController } = require('../controllers/StreamController');
let router = express.Router();

/**
 * @openapi
 * /streams/video/{tokenId}:
 *   get:
 *     summary: Starts a video stream
 *     tags: [Videos]
 *     description: Starts a stream, sign in is required
 *     parameters:
 *        - name: tokenId
 *          in: path
 *          required: true
 *          description: ID of the video
 *          schema:
 *            type: string
 *        - $ref: '#/parameters/addressQueryParam'
 *        - $ref: '#/parameters/sigQueryParam'
 *        - $ref: '#/parameters/timestampQueryParam'
 *     responses:
 *       200:
 *         description: OK
 */

router.get('/video/:id', (req, res, next) => {
  StreamController.getStream(req, res, next);
});

module.exports = router;
