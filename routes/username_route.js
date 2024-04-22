let express = require('express');
let router = express.Router();
const UsernameController = require('../controllers/UsernameController');
const { isAuthorized } = require('../utils/auth');

// General
router.get('/offers', UsernameController.getOffers);
router.get('/stats', UsernameController.getOffersStats);

// Sellers
router.get('/myoffers', isAuthorized, UsernameController.getUserOffers);
router.post('/list', isAuthorized, UsernameController.listUsernameForSale);
router.delete('/list', isAuthorized, UsernameController.cancelListing);
router.get('/offers/:offerId/accept', isAuthorized, UsernameController.acceptOffer);
router.get('/offers/:offerId/reject', isAuthorized, UsernameController.rejectOffer);
router.delete('/', isAuthorized, UsernameController.deleteUsername);

// // Buyers
router.post('/offers', isAuthorized, UsernameController.makeOffer);
router.get('/pending-tx', isAuthorized, UsernameController.getPendingTx);
router.delete('/offers/:offerId', isAuthorized, UsernameController.deleteOffer);
router.post('/buy', isAuthorized, UsernameController.buyNow);

// // Delegation
// get delegates
// get delegated accounts
// router.post('/delegate-access',isAuthorized, UsernameController.delegateAccountAccess);

module.exports = router;

// Documentation

/**
 * @swagger
 * tags:
 *   - name: Username
 *     description: Username sale system and delegation
 */

/**
 * @openapi
 * /api/username/offers:
 *   get:
 *     summary: Get all offers
 *     tags: [Username]
 *     description: Retrieves all offers available.
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/stats:
 *   get:
 *     summary: Get offers statistics
 *     tags: [Username]
 *     description: Retrieves statistics related to offers.
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/myoffers:
 *   get:
 *     summary: Get user's offers
 *     tags: [Username]
 *     description: Retrieves offers belonging to the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/list:
 *   post:
 *     summary: List username for sale
 *     tags: [Username]
 *     description: Allows the user to list their username for sale.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               price:
 *                 type: number
 *             required:
 *               - username
 *               - price
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/list:
 *   delete:
 *     summary: Cancel username listing
 *     tags: [Username]
 *     description: Allows the user to cancel the listing of their username.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/offers/{offerId}/accept:
 *   get:
 *     summary: Accept offer
 *     tags: [Username]
 *     description: Allows the user to accept an offer.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: offerId
 *         in: path
 *         required: true
 *         description: ID of the offer to accept
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/offers/{offerId}/reject:
 *   get:
 *     summary: Reject offer
 *     tags: [Username]
 *     description: Allows the user to reject an offer.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: offerId
 *         in: path
 *         required: true
 *         description: ID of the offer to reject
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/:
 *   delete:
 *     summary: Delete username
 *     tags: [Username]
 *     description: Allows the user to delete their username.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/offers:
 *   post:
 *     summary: Make offer
 *     tags: [Username]
 *     description: Allows the user to make an offer.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               price:
 *                 type: number
 *             required:
 *               - username
 *               - price
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/pending-tx:
 *   get:
 *     summary: Get pending transactions
 *     tags: [Username]
 *     description: Retrieves pending transactions related to offers made by the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/offers/{offerId}:
 *   delete:
 *     summary: Delete offer
 *     tags: [Username]
 *     description: Allows the user to delete an offer.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: offerId
 *         in: path
 *         required: true
 *         description: ID of the offer to delete
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/buy:
 *   post:
 *     summary: Buy now[not implemented]
 *     tags: [Username]
 *     description: Allows the user to buy a username.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               offerId:
 *                 type: string
 *             required:
 *               - offerId
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/delegate-access:
 *   post:
 *     summary: Delegate access to your account to an address[not implemented]
 *     tags: [Username]
 *     description: Allows the user to choose addresses that can access their account.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/delegate/{address}:
 *   delete:
 *     summary: Remove a delegate[not implemented]
 *     tags: [Username]
 *     description: Allows the user to remove one address that can access their account.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: address
 *         in: path
 *         required: true
 *         description: Address of delegate to remove
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/delegates:
 *   get:
 *     summary: Your delegates[not implemented]
 *     tags: [Username]
 *     description: Accounts you have delegated accesst to.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful operation
 */

/**
 * @openapi
 * /api/username/delegators:
 *   get:
 *     summary: Your delegators if any[not implemented]
 *     tags: [Username]
 *     description: Accounts that have delegated access to you.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful operation
 */
