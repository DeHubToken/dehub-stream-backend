const fs = require('fs');
const path = require('path');

const defaultVideoFilePath = tokenId => {
  return `${process.env.CDN_BASE_URL}videos/${tokenId}.mp4`;
};

const getTempVideoFilePath = (tokenId: number, videoExt = 'mp4') => {
  return `${path.dirname(__dirname)}/assets/videos/${tokenId}_c.${videoExt}`;
};

const defaultImageFilePath = (tokenId: number, imageExt = 'jpg') => {
  return `${process.env.CDN_BASE_URL}images/${tokenId}.${imageExt}`;
};

const defaultTokenImagePath = (tokenId: string, address: string) => {
  // Construct the base URL
  let url = `${process.env.CDN_BASE_URL}/${address}/${tokenId}`;

  // Check if the URL already has an extension (e.g., .jpg, .png, etc.)
  const hasExtension = /\.(jpg|jpeg|png|gif|svg)$/i.test(url);

  // If no extension is found, add a default .jpg extension
  if (!hasExtension) {
    url += '.jpg';
  }

  return url;
};

export { defaultVideoFilePath, defaultImageFilePath, getTempVideoFilePath ,defaultTokenImagePath};
