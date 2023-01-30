const { ethers } = require("ethers");
let express = require("express");
const fs = require("fs");
const path = require("path");
const { ApiController } = require("../controllers/ApiController");
let router = express.Router();
var multer = require("multer");
const upload = multer({ dest: "uploads/" });

/**
 * return server time as second unit
 */
router.get("/getServerTime", async function (req, res, next) {
    return ApiController.getServerTime(req, res, next);
});
router.post("/signinWithWallet", async function (req, res, next) {
    return ApiController.signWithWallet(req, res, next);
});
router.post(
    "/user_mint",
    upload.fields([
        { name: "files", maxCount: 2 }
    ]),
    async function (req, res, next) {
        return ApiController.getSignedDataForUserMint(req, res, next);
    }
);
router.get("/all_nfts", async function (req, res, next) {
    return ApiController.getAllNfts(req, res, next);
});
router.get("/my_nfts", async function (req, res, next) {
    return ApiController.getMyNfts(req, res, next);
});
router.get("/search_nfts", async function (req, res, next) {
    return ApiController.getFilteredNfts(req, res, next);
});
router.get("/my_watched_nfts", async function (req, res, next) {
    return ApiController.getMyWatchedNfts(req, res, next);
});
router.get("/nft_info/:id", async function (req, res, next) {
    return ApiController.getNftInfo(req, res, next);
});
router.get("/account_info/:id", async function (req, res, next) {
    return ApiController.getAccountInfo(req, res, next);
});
router.get('/claim', async function (req, res, next) {
    return ApiController.getSignDataForClaim(req, res, next);
})
router.post('/claim', async function (req, res, next) {
    return ApiController.getSignDataForClaim(req, res, next);
})
router.post(
    "/update_profile",
    upload.fields([
        { name: "coverImg", maxCount: 1 },
        { name: "avatarImg", maxCount: 1 },
    ]),
    async function (req, res, next) {
        return ApiController.updateProfile(req, res, next);
    },
);
router.post('/request_ppv_stream', async function (req, res, next) {
    return ApiController.requestPPVStream(req, res, next);
});
router.get('/request_ppv_stream', async function (req, res, next) {
    return ApiController.requestPPVStream(req, res, next);
});
router.get('/request_like', async function (req, res, next) {
    return ApiController.requestLike(req, res, next);
});

router.get('/leaderboard', async function (req, res, next) {
    return ApiController.leaderboard(req, res, next);
});

module.exports = router;
