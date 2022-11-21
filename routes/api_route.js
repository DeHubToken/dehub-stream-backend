const { ethers } = require('ethers');
let express = require('express');
const fs = require('fs');
const path = require("path");
const { ApiController } = require('../controllers/ApiController');
const { reqParam } = require('../utils/auth');
let router = express.Router();
/**
 * return server time as second unit
 */
router.get('/getServerTime', async function (req, res, next) { return ApiController.getServerTime(req, res, next); });
router.post('/signinWithWallet', async function (req, res, next) { return ApiController.signWithWallet(req, res, next); });
router.get('/video/:id', (req, res) => {    
    const videoPath = `${path.dirname(__dirname)}/assets/videos/01.mp4`;
    const videoStat = fs.statSync(videoPath);
    const fileSize = videoStat.size;
    const videoRange = req.headers.range; if (videoRange) {
        const parts = videoRange.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        let chunksize = (end - start) + 1;        
        if (chunksize > 8000001) {
            chunksize = 8000001;
            end = start + chunksize - 1;
        }
        const file = fs.createReadStream(videoPath, { start, end });
        const header = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };

        res.writeHead(206, header);
        file.pipe(res);
        // } else {
        //     const head = {
        //         'Content-Length': fileSize,
        //         'Content-Type': 'video/mp4',
        //     };
        //     res.writeHead(200, head);
        //     fs.createReadStream(videoPath).pipe(res);
    }
    // return res.json({ videoStat, videoStat });
})
router.post('/user_mint', async function (req, res, next) { return ApiController.getSignedDataForUserMint(req, res, next); });
router.get('/all_nfts', async function (req, res, next) { return ApiController.getAllNfts(req, res, next); });
module.exports = router;
