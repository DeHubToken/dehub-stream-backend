const { isAddress } = require('ethers/lib/utils');
let express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const sharp = require('sharp');
const { reqParam } = require('../utils/auth');

/**
 * @openapi
 * /statics/covers/{addressWithExt}:
 *   get:
 *     summary: Fetches a cover image
 *     tags: [Images]
 *     description: Cover images for profile accounts, width can be changed by adding 'w' in the parameters. It maintains it's aspect ratio
 *     parameters:
 *        - name: addressWithExt
 *          in: path
 *          required: true
 *          description: User address with extenstion
 *          schema:
 *            type: string
 *          example: "0x.....jpeg"
 *        - $ref: '#/parameters/imageWidthQueryParam'
 *     responses:
 *       200:
 *         description: OK
 */

router.get('/covers/:id', async (req, res, next) => {
  const addressWithExt = req.params?.id;
  const width = Number(reqParam(req, 'w') || 1200);
  if (!addressWithExt || addressWithExt.split('.')?.length < 1) return res.json({ error: true });
  const imageExt = addressWithExt.split('.').pop();
  const address = addressWithExt.substring(0, addressWithExt.length - imageExt.length - 1);
  if (!isAddress(address)) return res.json({ error: true });
  const coverImagePath = `${path.dirname(__dirname)}/assets/covers/${address.toLowerCase()}.${imageExt}`;
  const compressedImage = await sharp(coverImagePath).resize({ width, height: 300, fit: 'cover' }).toBuffer();
  res.set('Content-Type', 'image/png');
  res.set('Content-Length', compressedImage.length);

  //   const sizeInMegabytes = compressedImage.length / (1024 * 1024);
  //   console.log(`${sizeInMegabytes.toFixed(2)} MB`);

  return res.send(compressedImage);
  //   return res.sendFile(coverImagePath);
});

/**
 * @openapi
 * /statics/avatars/{addressWithExt}:
 *   get:
 *     summary: Fetches an avatar
 *     tags: [Images]
 *     description: Avatar images for profile accounts, width can be changed by adding 'w' in the parameters. It maintains it's aspect ratio
 *     parameters:
 *        - name: addressWithExt
 *          in: path
 *          required: true
 *          description: User address with extenstion
 *          schema:
 *            type: string
 *          example: "0x.....jpeg"
 *        - $ref: '#/parameters/imageWidthQueryParam'
 *     responses:
 *       200:
 *         description: OK
 */

router.get('/avatars/:id', async (req, res, next) => {
  const addressWithExt = req.params?.id;
  const width = Number(reqParam(req, 'w') || 50);
  if (!addressWithExt || addressWithExt.split('.')?.length < 1) return res.json({ error: true });
  const imageExt = addressWithExt.split('.').pop();
  const address = addressWithExt.substring(0, addressWithExt.length - imageExt.length - 1);
  if (!isAddress(address)) return res.json({ error: true });
  const avatarImagePath = `${path.dirname(__dirname)}/assets/avatars/${address.toLowerCase()}.${imageExt}`;
  const compressedImage = await sharp(avatarImagePath).resize({ width: width, fit: 'cover' }).toBuffer();
  res.set('Content-Type', 'image/png');
  res.set('Content-Length', compressedImage.length);

  //   const sizeInMegabytes = compressedImage.length / (1024 * 1024);
  //   console.log(`${sizeInMegabytes.toFixed(2)} MB`);

  return res.send(compressedImage);
  // return res.sendFile(avatarImagePath);
});

module.exports = router;
