import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PlansModel } from 'models/Plans';
import { SubscriptionModel } from 'models/subscription';

const tokenABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'creator', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'id', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'uri', type: 'string' },
    ],
    name: 'PlanCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'subscriber', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'id', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'uri', type: 'string' },
    ],
    name: 'SubscriptionBought',
    type: 'event',
  },
];
const { supportedNetworks, subscriptionCollectionAddress } = require('../../config/constants');

@Injectable()
export class PlanEventListenerService implements OnModuleInit {
  private readonly logger = new Logger(PlanEventListenerService.name);
  private listeners: { [chainId: number]: ethers.Contract } = {};

  async onModuleInit() {
    this.logger.log('--- Starting event listeners for all supported networks');
    // Set up listeners for each supported network directly without cron jobs.
    await this.setupListeners();
  }

  // Directly set up event listeners for each network
  async setupListeners() {
    // Set up listeners for each supported network
    const networks = supportedNetworks;
    if (!networks || networks.length === 0) {
      this.logger.error('No supported networks found.');
      return;
    }

    for (const network of networks) {
      await this.mainLoop(network.shortName);
    }
  }

  // Main method for handling contract events
  async mainLoop(networkName: string) {
    const network = supportedNetworks.find(n => n.shortName === networkName);
    if (!network) {
      this.logger.error(`Network not found: ${networkName}`);
      return;
    }

    this.logger.log(`Starting event listener for ${networkName}...`);

    try {
      if (!subscriptionCollectionAddress[network.chainId]) {
        this.logger.error(
          `Can not Instantiating contract for ${networkName} with address: ${subscriptionCollectionAddress[network.chainId]}`,
        );
        return;
      }
      console.log("PlanEventListenerService JsonRpcProvider--->")

      const provider = new ethers.JsonRpcProvider(network.rpcUrls[0]);

      this.logger.log(
        `Instantiating contract for ${networkName} with address: ${subscriptionCollectionAddress[network.chainId]}`,
      );

      const NFTContract: any = new ethers.Contract(subscriptionCollectionAddress[network.chainId], tokenABI, provider);
      this.listeners[network.chainId] = NFTContract;

      // Listen for SubscriptionBought event
      NFTContract.on('SubscriptionBought', async (subscriber, id, uri) => {
        await this.handleSubscriptionBought(network.chainId, NFTContract.address, subscriber, id, uri);
      });

      // Listen for PlanCreated event
      NFTContract.on('PlanCreated', async (creator, id, uri) => {
        await this.handlePlanCreated(network.chainId, NFTContract.address, creator, id, uri);
      });

      this.logger.log(`Listening for SubscriptionBought and PlanCreated events on ${networkName}`);
    } catch (error) {
      this.logger.error(`Error setting up listener for ${networkName}: ${error.message}`);
    }
  }

  // Handle SubscriptionBought event
  private async handleSubscriptionBought(
    chainId: number,
    contractAddress: string,
    subscriber: string,
    id: ethers.BigNumberish,
    uri: string,
  ) {
    try {
      this.logger.log(`Received SubscriptionBought event on chainId ${chainId}`);
      this.logger.log(`Event details: subscriber=${subscriber}, id=${id.toString()}, uri=${uri}`);

      // Find the subscription by id
      const subscription = await SubscriptionModel.findOne({ id: id.toString() });

      if (!subscription) {
        this.logger.error(`Subscription not found for id: ${id.toString()}`);
        return;
      }

      // Find the plan associated with the subscription
      const plan = await PlansModel.findById(subscription.planId);

      if (!plan) {
        this.logger.error(`Plan not found for planId: ${subscription.planId.toString()}`);
        return;
      }

      // Set startDate as the current date
      const startDate = new Date();

      // Calculate endDate based on plan duration
      let endDate = new Date(startDate); // Make a copy of the start date

      const duration = plan.duration;
      if (duration === 1) {
        // 1 month expiration
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (duration === 999) {
        // Lifetime plan (999 years expiration)
        endDate.setFullYear(endDate.getFullYear() + 999);
      } else {
        // Other durations (3 months, 6 months, 1 year, etc.)
        endDate.setMonth(endDate.getMonth() + duration);
      }

      // Update the subscription with the calculated startDate, endDate, and mark it as active
      const updatedSubscription = await SubscriptionModel.findOneAndUpdate(
        { id: id.toString() },
        {
          $set: {
            startDate: startDate,
            endDate: endDate,
            active: true,
          },
        },
        { new: true }, // Return the updated document
      );

      if (updatedSubscription) {
        this.logger.log(`Subscription updated with startDate and endDate for id: ${id.toString()}`);
      } else {
        this.logger.error(`Failed to update subscription with id: ${id.toString()}`);
      }
    } catch (error) {
      this.logger.error(`Error processing SubscriptionBought event: ${error.message}`);
    }
  }

  // Handle PlanCreated event
  private async handlePlanCreated(
    chainId: number,
    contractAddress: string,
    creator: string,
    id: ethers.BigNumberish,
    uri: string,
  ) {
    try {
      this.logger.log(`Received PlanCreated event on chainId ${chainId}`);
      this.logger.log(`Event details: creator=${creator}, id=${id.toString()}, uri=${uri}`);

      // Update the plan in the database by finding it based on the id and creator address
      const plan = await PlansModel.findOneAndUpdate(
        {
          id: id.toString(),
          'chains.chainId': chainId, // Match the chainId in the chains array
          address: creator.toLowerCase(), // Match the creator address (lowercased)
        },
        {
          $set: {
            'chains.$.status': true, // Set status to true (active)
            'chains.$.isPublished': true, // Set isPublished to true
          },
        },
        { new: true }, // Return the updated document
      );

      if (!plan) {
        this.logger.warn(`No plan found for id: ${id.toString()} on chainId: ${chainId}`);
      } else {
        this.logger.log(`Plan updated successfully for id: ${id.toString()} on chainId: ${chainId}`);
      }
    } catch (error) {
      this.logger.error(`Error processing PlanCreated event: ${error.message}`);
    }
  }
}
