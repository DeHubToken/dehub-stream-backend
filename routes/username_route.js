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
