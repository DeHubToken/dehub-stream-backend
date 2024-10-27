import { supportedVideoTypes, supportedImageTypes } from '../../config/constants';
import sharp from 'sharp';

type MediaGroup = 'video' | 'image';

const normalizeAddress = (address: string | undefined | null): string | undefined => {
  return address?.toString().toLowerCase();
};

const checkFileType = (file: Express.Multer.File | null | undefined, mediaGroup: MediaGroup = 'video'): boolean => {
  if (!file) return false;

  const supportedTypes = mediaGroup === 'video' ? supportedVideoTypes : supportedImageTypes;
  const reqType = file.mimetype.toString().substring(file.mimetype.indexOf('/'));

  if (!supportedTypes.includes(reqType)) {
    console.log('---not supported file type', file.mimetype, file);
    return false;
  }
  
  return true;
};

const compressImage = async (imagePath: string, width: number, height: number): Promise<Buffer> => {
  return await sharp(imagePath)
    .resize(width, height)
    .toBuffer();
};

export {
  normalizeAddress,
  checkFileType,
  compressImage,
};
