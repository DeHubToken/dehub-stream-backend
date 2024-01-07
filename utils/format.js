const { supportedVideoTypes, supportedImageTypes } = require('../config/constants');
const sharp = require('sharp');

const normalizeAddress = address => address?.toString()?.toLowerCase();
const checkFileType = (file, mediaGroup = 'video') => {
  if (!file) return false;
  const supportedTypes = mediaGroup === 'video' ? supportedVideoTypes : supportedImageTypes;
  const reqType = file.mimetype.toString().substr(file.mimetype.toString().indexOf('/'));
  if (!supportedTypes.includes(reqType)) {
    console.log('---not supported file type', file.mimetype, file);
    return false;
  }
  return true;
};

const compressImage = async (imagePath, width, height) => {};
module.exports = {
  normalizeAddress,
  checkFileType,
  compressImage,
};
