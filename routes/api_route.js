let express = require('express');
const fs = require('fs');
const { ApiController } = require('../controllers/ApiController');
let router = express.Router();
var multer = require('multer');
const { isAuthorized } = require('../utils/auth');
const NotificationController = require('../controllers/NotificationController');
const LikedVideosController = require('../controllers/LikedVideoController');

// const usernameRoutes = require('./username_route');

const upload = multer({ dest: 'uploads/' });

/**
 * @openapi
 * /api/getServerTime:
 *   get:
 *     summary: Server time
 *     tags: [Misc]
 *     description: Returns server time in second
 *     responses:
 *       200:
 *         description: OK
 */

router.get('/getServerTime', ApiController.getServerTime);

/**
 * @openapi
 * /api/signinWithWallet:
 *   post:
 *     summary: Sign in with wallet
 *     tags: [Auth]
 *     description: Signs in an authorized user and update their lastLoginTimestamp
 *     parameters:
 *        - $ref: '#/parameters/addressQueryParam'
 *        - $ref: '#/parameters/sigQueryParam'
 *        - $ref: '#/parameters/timestampQueryParam'
 *     responses:
 *       200:
 *         description: OK
 */

router.post('/signinWithWallet', isAuthorized, ApiController.signWithWallet);

router.post('/loginWithWallet', isAuthorized, ApiController.login);

/**
 * @openapi
 * /api/user_mint:
 *   post:
 *     summary: Video and Image Upload for NFT Minting
 *     tags: [Users, Videos]
 *     description: |
 *       Mint a token/Video by uploading video and image files.
 *     parameters:
 *       - $ref: '#/parameters/addressQueryParam'
 *       - $ref: '#/parameters/sigQueryParam'
 *       - $ref: '#/parameters/timestampQueryParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *            schema:
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: NFT minted successfully
 *       '400':
 *         description: Bad Request
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Invalid request payload or files
 */
// continue later

router.post(
  '/user_mint',
  upload.fields([{ name: 'files', maxCount: 2 }]),
  isAuthorized,
  ApiController.getSignedDataForUserMint,
);

router.post('/token_visibility', ApiController.updateTokenVisibility)
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
router.get('/users_count', ApiController.getNumberOfUsers);
router.get('/users_search', ApiController.searchUsers);
router.get('/is_valid_username', ApiController.isValidUsername);

router.post('/public_accounts', ApiController.publicAccountData);
router.get('/get_reactions', ApiController.getReactions);

// Notifications ------------- Can't be created by endpoints. Created internally
// router.post('/notification', isAuthorized, NotificationController.createNotification);
router.get('/notification', isAuthorized, NotificationController.getUnreadNotifications);
router.patch('/notification/:notificationId', isAuthorized, NotificationController.markNotificationAsRead);

// Liked Videos ------------- Can't be created by endpoints. Created internally
router.get('/liked-videos', isAuthorized, LikedVideosController.get);
// router.delete('/liked-videos/:id', isAuthorized, LikedVideosController.remove);

// Usernames delegation and sales

// router.use('/username', usernameRoutes);

module.exports = router;
