const UsernameOffer = require('../models/UsernameOffers');
const { Account } = require('../models/Account');

const OfferService = {
  getAllOffers: async () => {
    try {
      const offers = await UsernameOffer.find({ status: { $in: ['listed'] } });
      return offers;
    } catch (error) {
      throw new Error('Error retrieving offers from the database');
    }
  },

  getOfferStats: async () => {
    try {
      const totalOffers = await UsernameOffer.countDocuments();
      const totalPending = await UsernameOffer.countDocuments({ status: 'pending' });
      const totalListed = await UsernameOffer.countDocuments({ status: 'listed' });
      const totalAcceptedOffers = await UsernameOffer.countDocuments({ status: 'accepted' });
      const totalRejectedOffers = await UsernameOffer.countDocuments({ status: 'rejected' });
      const totalCancelledOffers = await UsernameOffer.countDocuments({ status: 'cancelled' });
      const totalDeletedOffers = await UsernameOffer.countDocuments({ status: 'deleted' });

      const stats = {
        totalOffers,
        totalListed,
        totalPending,
        totalAcceptedOffers,
        totalRejectedOffers,
        totalCancelledOffers,
        totalDeletedOffers,
      };

      return stats;
    } catch (error) {
      throw new Error('Error retrieving offer stats from the database');
    }
  },

  getUserOffers: async username => {
    try {
      const offers = await UsernameOffer.find({ username, status: { $in: ['pending', 'tx_pending', 'tx_failed'] } });
      return offers;
    } catch (error) {
      throw new Error('Error retrieving user offers from the database');
    }
  },

  getPendingTx: async (username, address) => {
    try {
      const offers = await UsernameOffer.find({ username, offerBy: address, status: { $in: ['tx_pending'] } });
      return offers;
    } catch (error) {
      throw new Error('Error retrieving user offers from the database');
    }
  },

  listUsernameForSale: async (username, price) => {
    try {
      const existingOffer = await UsernameOffer.findOne({ username, status: 'listed' });

      if (existingOffer) {
        existingOffer.price = price;
        await existingOffer.save();
        return existingOffer;
      } else {
        const offer = new UsernameOffer({
          username,
          price,
          status: 'listed',
        });
        await offer.save();
        return offer;
      }
    } catch (error) {
      throw new Error('Error listing username for sale in the database');
    }
  },

  acceptOffer: async offerId => {
    try {
      const offer = await UsernameOffer.findByIdAndUpdate(offerId, { status: 'accepted' }, { new: true });
      return offer;
    } catch (error) {
      throw new Error('Error accepting offer in the database');
    }
  },

  rejectOffer: async offerId => {
    try {
      const offer = await UsernameOffer.findByIdAndUpdate(offerId, { status: 'rejected' }, { new: true });
      return offer;
    } catch (error) {
      throw new Error('Error rejecting offer in the database');
    }
  },

  cancelListing: async offerId => {
    try {
      await UsernameOffer.findByIdAndUpdate(offerId, { status: 'deleted' }, { new: true });
      return true;
      //   res.json({ message: 'Listing cancelled successfully' });
    } catch (error) {
      throw new Error('Error cancelling listing in the database');
    }
  },

  deleteUsername: async address => {
    try {
      // get account details
      // check if username exists
      // check if its listed, if it's not, continue
      // if its listed, changed to deleted
      // then update username from Account to null
      const account = await Account.findOne({ address }, {});
      const username = account?.username;
      if (!username) throw new Error('Username does not exist');
      const offers = await UsernameOffer.find({ username, status: 'listed' });
      if (offers.length > 0) {
        await UsernameOffer.findByIdAndUpdate(offers._id, { status: 'deleted' }, { new: true });
      }
      await Account.findOneAndUpdate({ address }, { $set: { username: null } });
      return true;
    } catch (error) {
      throw new Error('Error deleting username in the database');
    }
  },

  makeOffer: async (buyerAddress, username, price) => {
    try {
      const isListed = await UsernameOffer.exists({ username, status: 'listed' });
      if (!isListed) {
        throw new Error('Username is not listed');
      }

      const existingOffer = await UsernameOffer.findOne({ username, offerBy: buyerAddress, status: 'pending' });

      if (existingOffer) {
        existingOffer.price = price;
        await existingOffer.save();
        return existingOffer;
      } else {
        const offer = new UsernameOffer({
          username,
          price,
          offerBy: buyerAddress,
          status: 'pending',
        });
        await offer.save();
        return offer;
      }
    } catch (error) {
      throw new Error('Error making offer in the database');
    }
  },

  deleteOffer: async offerId => {
    try {
      await UsernameOffer.findByIdAndUpdate(offerId, { status: 'deleted' }, { new: true });
      return true;
    } catch (error) {
      throw new Error('Error deleting offer in the database');
    }
  },

  // come back to this
  verifyAndCompletePurchase: async (username, price, buyerAddress, txHash, offerId) => {
    // Implement payment logic and check if both sides have approved
    //    i.e if buyer offer has been accepted/tx_failed or if seller offer is listed and is not in tx
    // if tx is pending, change status to tx_pending or tx_failed if failed
    // and change offerBy to the buyer address
    // also check if from, to and amount matches
    // if tx is successful, change status to purchased
    // update Transactions with record
    // update Account with new username and remove old one
    // Update seller offer to purchased
    // Update buyer offer to accepted
    try {
      /*
      const provider = new ethers.providers.JsonRpcProvider('ETHEREUM_RPC_URL');

       const transaction = await provider.getTransaction(txHash);
       
       if (!transaction) {
         throw new Error('Transaction not found');
       }
 
       const isPending = !transaction.blockNumber;
       const isFailed = transaction.status === 0;
       const isSuccessful = !isPending && !isFailed;
       if (isPending) {
        await updateOfferStatus(offerId, isFailed ? 'tx_failed' : 'tx_pending', buyerAddress);
         return { status: 'pending', message: 'Transaction is pending. Please wait for confirmation.' };
       } else if (isFailed) {
         throw new Error('Transaction failed');
       }
 
       // Transaction is successful
       // Validate transaction details (e.g sender, recipient, amount)
 
       // Update database
       await updateDatabaseRecords(username, buyerAddress);
 
       // Update offer statuses
       await updateOfferStatuses(offerId, buyerAddress);
       return { status: 'purchased', message: 'Transaction completed successfully' };
    */
    } catch (error) {
      throw new Error('Error  in purchasing the username');
    }
  },
};

module.exports = OfferService;
