// const { ethers } = require("ethers");
let express = require('express');
const fs = require('fs');
// const path = require("path");
const { ApiController } = require('../controllers/ApiController');
let router = express.Router();
var multer = require('multer');
const { isAuthorized } = require('../utils/auth');
const NotificationController = require('../controllers/NotificationController');
const upload = multer({ dest: 'uploads/' });

/**
 * return server time as second unit
 */
router.get('/getServerTime', ApiController.getServerTime);
router.post('/signinWithWallet', isAuthorized, ApiController.signWithWallet);
router.post(
  '/user_mint',
  upload.fields([{ name: 'files', maxCount: 2 }]),
  isAuthorized,
  ApiController.getSignedDataForUserMint,
);
router.get('/all_nfts', ApiController.getAllNfts);
router.get('/my_nfts', ApiController.getMyNfts);
router.get('/search_nfts', ApiController.getFilteredNfts);
router.get('/my_watched_nfts', ApiController.getMyWatchedNfts);
router.get('/nft_info/:id', ApiController.getNftInfo);
router.get('/account_info/:id', ApiController.getAccountInfo);
router.get('/unlocked_nfts/:id', ApiController.getUnlockedNfts);
// deprecated claim transaction
// router.get('/claim', async function (req, res, next) {
//     return ApiController.getSignDataForClaim(req, res, next);
// })
// // update apis
// router.post('/claim', async function (req, res, next) {
//     return ApiController.getSignDataForClaim(req, res, next);
// })
router.post(
  '/update_profile',
  upload.fields([
    { name: 'coverImg', maxCount: 1 },
    { name: 'avatarImg', maxCount: 1 },
  ]),
  isAuthorized,
  ApiController.updateProfile,
);
// deprecated ppv_stream api
// router.post('/request_ppv_stream', isAuthorized, ApiController.requestPPVStream);
// router.get('/request_ppv_stream', isAuthorized, ApiController.requestPPVStream);
router.get('/request_like', isAuthorized, ApiController.requestLike);
router.get('/request_tip', isAuthorized, ApiController.requestTip);
router.get('/request_comment', isAuthorized, ApiController.requestComment);
router.get('/request_vote', isAuthorized, ApiController.requestVote);
router.get('/request_follow', isAuthorized, ApiController.requestFollow);
router.get('/claim_bounty', isAuthorized, ApiController.getSignForClaimBounty);
router.get('/add_category', isAuthorized, ApiController.addCategory);
router.get('/request_reaction', isAuthorized, ApiController.requestReaction);

// apis to get public data
router.get('/leaderboard', ApiController.leaderboard);
router.get('/get_categories', ApiController.getCategories);
router.get('/usernames', ApiController.getUsernames);
router.get('/is_valid_username', ApiController.isValidUsername);

router.post('/public_accounts', ApiController.publicAccountData);
router.get('/get_reactions', ApiController.getReactions);

// Notifications ------------- Can't be created by endpoints. Created internally
// router.post('/notification', isAuthorized, NotificationController.createNotification);
router.get('/notification', isAuthorized, NotificationController.getUnreadNotifications);
router.patch('/notification/:notificationId', isAuthorized, NotificationController.markNotificationAsRead);

module.exports = router;
