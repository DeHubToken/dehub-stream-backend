const { paramNames } = require('../config/constants');
const usernameService = require('../services/UsernameService'); // Import your notification service
const { reqParam } = require('../utils/auth');
const { Account } = require('../models/Account');

const UsernameController = {
  getOffers: async (req, res) => {
    try {
      const offers = await usernameService.getAllOffers();
      res.json(offers);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  getOffersStats: async (req, res) => {
    try {
      const stats = await usernameService.getOfferStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  getUserOffers: async (req, res) => {
    const address = reqParam(req, paramNames.address);
    const account = await Account.findOne({ address }, {});
    const username = account?.username;
    if (!username) return res.status(400).json({ error: true, msg: 'User does not have a username' });
    try {
      const offers = await usernameService.getUserOffers(username);
      res.json(offers);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  getPendingTx: async (req, res) => {
    const address = reqParam(req, paramNames.address);
    const account = await Account.findOne({ address }, {});
    const username = account?.username;
    if (!username) return res.status(400).json({ error: true, msg: 'User does not have a username' });
    try {
      const offers = await usernameService.getPendingTx(username, address);
      res.json(offers);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  listUsernameForSale: async (req, res) => {
    const { price } = req.body;
    const address = reqParam(req, paramNames.address);
    const account = await Account.findOne({ address }, {});
    const username = account?.username;
    if (!price) return res.status(400).json({ error: true, msg: 'Bad Request: Price is required' });
    if (!username) return res.status(400).json({ error: true, msg: 'User does not have a username' });
    try {
      const offer = await usernameService.listUsernameForSale(username, price);
      res.json({ message: 'Username listed for sale successfully', offer });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  acceptOffer: async (req, res) => {
    let offerId = req.params.offerId;
    if (!offerId) return res.status(400).json({ error: true, msg: 'Bad Request: offerId is required' });
    try {
      const offer = await usernameService.acceptOffer(offerId);
      res.json(offer);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  rejectOffer: async (req, res) => {
    let offerId = req.params.offerId;
    if (!offerId) return res.status(400).json({ error: true, msg: 'Bad Request: offerId is required' });
    try {
      const offer = await usernameService.rejectOffer(offerId);
      res.json(offer);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  cancelListing: async (req, res) => {
    let offerId = req.params.offerId;
    if (!offerId) return res.status(400).json({ error: true, msg: 'Bad Request: offerId is required' });
    try {
      const offer = await usernameService.cancelListing(offerId);
      res.json(offer);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  deleteUsername: async (req, res) => {
    const address = reqParam(req, paramNames.address);
    try {
      const response = await usernameService.deleteUsername(address);
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  makeOffer: async (req, res) => {
    const address = reqParam(req, paramNames.address);
    const { username, price } = req.body;
    if (!username || !price)
      return res.status(400).json({ error: true, msg: 'Bad Request: Price and Username is required' });
    try {
      const response = await usernameService.makeOffer(address, username, price);
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  deleteOffer: async (req, res) => {
    let offerId = req.params.offerId;
    if (!offerId) return res.status(400).json({ error: true, msg: 'Bad Request: offerId is required' });
    try {
      const offer = await usernameService.deleteOffer(offerId);
      res.json(offer);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  buyNow: async (req, res) => {
    return res.json({ result: 'Not yet implemented brah' });
    const { username, price, txHash, offerId } = req.body;
    const buyerAddress = reqParam(req, paramNames.address);

    if (!username || !price || !txHash) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }
    try {
      const purchaseResult = await usernameService.verifyAndCompletePurchase(
        username,
        price,
        buyerAddress,
        txHash,
        offerId,
      );

      res.status(200).json({ success: true, result: purchaseResult });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  delegateAccountAccess: async function (req, res, next) {
    try {
      res.status(200).json({ message: 'Account delegated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = UsernameController;
