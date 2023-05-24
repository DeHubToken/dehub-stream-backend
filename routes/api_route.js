const { ethers } = require("ethers");
let express = require("express");
const fs = require("fs");
const path = require("path");
const { ApiController } = require("../controllers/ApiController");
let router = express.Router();
var multer = require("multer");
const { isAuthorized } = require("../utils/auth");
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
router.post("/user_mint", upload.fields([{ name: "files", maxCount: 2 }]), isAuthorized, async function (req, res, next) {
    return ApiController.getSignedDataForUserMint(req, res, next);
});
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
// deprecated claim transaction
// router.get('/claim', async function (req, res, next) {
//     return ApiController.getSignDataForClaim(req, res, next);
// })
// // update apis
// router.post('/claim', async function (req, res, next) {
//     return ApiController.getSignDataForClaim(req, res, next);
// })
router.post("/update_profile", upload.fields([{ name: "coverImg", maxCount: 1 }, { name: "avatarImg", maxCount: 1 },]), async function (req, res, next) {
    return ApiController.updateProfile(req, res, next);
});
router.post('/request_ppv_stream', async function (req, res, next) {
    return ApiController.requestPPVStream(req, res, next);
});
router.get('/request_ppv_stream', ApiController.requestPPVStream);
router.get('/request_like', ApiController.requestLike);
router.get('/request_tip', isAuthorized, ApiController.requestTip);
router.get('/request_comment', isAuthorized, ApiController.requestComment);
router.get('/request_vote', isAuthorized, ApiController.requestVote);
router.get('/request_follow', isAuthorized, ApiController.requestFollow);
router.get('/claim_bounty', isAuthorized, ApiController.getSignForClaimBounty);
router.get('/add_category', /* isAuthorized, */ ApiController.addCategory);

// get apis
router.get('/leaderboard', ApiController.leaderboard);
router.get('/get_categories', ApiController.getCategories);
router.get('/usernames', ApiController.getUsernames);
router.get('/is_valid_username', ApiController.isValidUsername);

module.exports = router;
