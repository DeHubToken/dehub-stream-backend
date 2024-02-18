const { isAddress } = require('ethers/lib/utils');
let express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const sharp = require('sharp');
const { reqParam } = require('../utils/auth');
const uniqid = require('uniqid');
const { moveFile } = require('../utils/file');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });
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

router.post('/chat-image', upload.fields([{ name: 'images', maxCount: 5 }]), async (req, res, next) => {
  try {
    const images = req.files?.images;
    if (!images || images.length === 0) {
      return res.status(400).json({ message: 'No images provided' });
    }
    const imageLinks = [];
    for (const image of images) {
      const imageExt = image.originalname.substr(image.originalname.toString().indexOf('.') + 1);
      const id = uniqid();
      const imagePath = `${path.dirname(__dirname)}/assets/chat/images/${id}.${imageExt}`;
      moveFile(image.path, imagePath);
      imageLinks.push(`statics/chat-images/${id}.${imageExt}`);
    }
    return res.json({ message: 'Image created', urls: imageLinks });
  } catch (error) {
    console.error('Error uploading images:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/chat-images/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(path.dirname(__dirname), `/assets/chat/images/${fileName}`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ message: 'Image not found' });
  }
});

module.exports = router;
