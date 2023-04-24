const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const { Token } = require('../models/Token');
const { defaultVideoFilePath, getTempVideoFilePath, moveFile } = require('./file');

const updateVideoInfo = async (tokenId, videoExt) => {
    const videoFilePath = defaultVideoFilePath(tokenId, videoExt);
    const videoInfo = await ffprobe(videoFilePath, { path: ffprobeStatic.path });
    const videoStream = videoInfo?.streams?.find(e => e.codec_type === 'video');
    if (!videoStream) {
        console.log('not find video stream', tokenId);
        await Token.updateOne({ tokenId: tokenId }, { transcodingStatus: 'failed' });
        return;
    }
    const videoDuration = videoStream.duration;
    const w = videoStream.width;
    const h = videoStream.height;
    let bitrate = Number(videoStream.bit_rate);
    const lang = videoStream.tags?.language;
    const audioStream = videoInfo?.streams?.find(e => e.codec_type === 'audio');
    let channelLayout = 'mono';
    if (audioStream) {
        channelLayout = audioStream.channel_layout;
        bitrate += Number(audioStream.bit_rate);
    }
    let updateTokenOption = {};
    let videoStat;
    try {
        videoStat = fs.statSync(videoFilePath);
    } catch (e) {
        console.log('----error when fetching for video size', e);
    }
    const fileSize = videoStat?.size;
    if (videoExt === 'mp4' && videoStream.start_time === '0.000000' && videoStream.codec_name === 'h264' && videoStream.is_avc === 'true')
        updateTokenOption.transcodingStatus = 'done';

    updateTokenOption.videoDuration = videoDuration;
    updateTokenOption.videoInfo = { w, h, bitrate, channelLayout, lang, size: fileSize };
    updateTokenOption.videoExt = videoExt;
    await Token.updateOne({ tokenId: tokenId }, updateTokenOption);
    console.log('updated video info', tokenId);
}

const transcodeVideo = async (tokenId, videoExt) => {
    const destVideoExt = 'mp4';
    const videoFilePath = defaultVideoFilePath(tokenId, videoExt);
    const tempFilePath = getTempVideoFilePath(tokenId, destVideoExt);
    await Token.updateOne({ tokenId }, { transcodingStatus: 'on' });
    ffmpeg(videoFilePath)
        .withOutputFormat('mp4')
        .on('end', async () => {
            console.log('--finished transcoding', tokenId);
            moveFile(tempFilePath, defaultVideoFilePath(tokenId, destVideoExt));
            if (destVideoExt !== videoExt)
                fs.unlink(videoFilePath, error => { if (error) console.error('delete source video error!', tokenId, videoExt) });
            await updateVideoInfo(tokenId, destVideoExt);
        })
        .saveToFile(tempFilePath);
}

module.exports = {
    updateVideoInfo,
    transcodeVideo
}