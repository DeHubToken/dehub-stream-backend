import { Injectable, Logger } from '@nestjs/common';
import { addProperty, reqParam } from 'common/util/auth';
import { durations } from 'config/constants';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { PlansModel } from 'models/Plans';
import { SubscriptionModel } from 'models/subscription';
import { ActivityService } from 'src/activity/activity.service';

const planTemplate = {
  id: 1,
  name: 1,
  description: 1,
  duration: 1,
  tier: 1,
  benefits: 1,
  chains: 1, // Includes all chain details (chainId, token, price, isPublished, isActive)
  createdAt: 1,
  updatedAt: 1,
  address: 1,
  _id: 0, // Exclude the MongoDB document ID
};

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);
  private activityService: ActivityService = new ActivityService();
  constructor() {}

  // GET single plan by ID
  async getPlan(req: Request, res: Response) {
    const { id } = req.params; // Extract plan ID from request parameters
    try {
      const plan = await PlansModel.findOne({ id }, planTemplate);
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }
      return res.status(200).json({ plan });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Error retrieving plan', details: error });
    }
  }

  // GET all plans
  async getPlans(req: Request, res: Response) {
    try {
      const obj = {};
      addProperty(req, obj, 'address');
      console.log(obj);
      const plans = await PlansModel.find(obj, planTemplate);
      return res.status(200).json({ plans });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Error retrieving plans', details: error });
    }
  }

  // CREATE a new plan
  async createPlan(req: Request, res: Response) {
    const obj: any = {};
    addProperty(req, obj, 'benefits');
    addProperty(req, obj, 'name');
    addProperty(req, obj, 'description');
    addProperty(req, obj, 'duration');
    addProperty(req, obj, 'tier');
    addProperty(req, obj, 'address');
    addProperty(req, obj, 'chains');

    // Check if a plan with the same tier and duration already exists
    const isExist = await PlansModel.findOne({
      address: obj.address.toLowerCase(),
      tier: obj.tier,
      duration: obj.duration,
    });
    if (isExist) {
      return res
        .status(409)
        .json({ error: 'Plan Already Exist!', msg: 'Plan Already Exist!' });
    }
    obj.address = obj.address.toLowerCase();
    const user: any = await AccountModel.findOne({
      address: obj.address,
    }).select('_id');
    if (!user) {
      return res
        .status(409)
        .json({ error: 'Account not Found!', msg: 'Account not Found!' });
    }

    obj.userId = user._id;
    // Create the new plan in the database
    const plan = await PlansModel.create(obj);
    return res.status(200).json({ msg: 'Plan created successfully', plan });
  }

  // UPDATE an existing plan
  async updatePlan(req: Request, res: Response) {
    const { id } = req.params; // Extract plan ID from request parameters
    const obj: any = {};
    addProperty(req, obj, 'benefits');
    addProperty(req, obj, 'name');
    addProperty(req, obj, 'description');
    addProperty(req, obj, 'duration');
    addProperty(req, obj, 'tier');
    addProperty(req, obj, 'address');
    addProperty(req, obj, 'chains');

    try {
      // Find the plan by ID and update with the new data
      const updatedPlan = await PlansModel.findOneAndUpdate(
        { id: `${id}` },
        obj,
        { new: true },
      );
      if (!updatedPlan) {
        return res.status(404).json({ error: 'Plan not found for update' });
      }
      return res
        .status(200)
        .json({ msg: 'Plan updated successfully', plan: updatedPlan });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Error updating plan', details: error });
    }
  }
  async createSubscription(req: Request, res: Response) {
    const obj: any = {};
    // Add necessary properties to the object
    addProperty(req, obj, 'planId');
    addProperty(req, obj, 'account');
    try {
      // Check if user exists
      const user = await AccountModel.findOne({
        address: obj.account?.toLowerCase(),
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if plan exists
      const plan = await PlansModel.findOne({
        id: obj.planId,
      });
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      // Find the duration object from the durations array based on the plan's duration
      const duration = durations.find((d) => d.value === plan.duration);
      if (!duration) {
        return res.status(400).json({ error: 'Invalid plan duration' });
      }

      // Check if the user already has an active subscription to this plan
      const activeSubscription = await SubscriptionModel.findOne({
        userId: user._id,
        planId: plan._id,
        active: true,
      });
      if (activeSubscription) {
        return res.status(400).json({
          error: 'User already has an active subscription to this plan',
        });
      }

      // Add default startDate if not present
      // obj.startDate = new Date();

      // Set the endDate based on the selected duration
      // obj.endDate = new Date(obj.startDate); // Make a copy of the start date

      // if (duration.value === 1) {
      //   // 1 month expiration
      //   obj.endDate.setMonth(obj.endDate.getMonth() + 1);
      // } else if (duration.value === 999) {
      //   // 999 years expiration (lifetime)
      //   obj.endDate.setFullYear(obj.endDate.getFullYear() + 999);
      // } else {
      //   // For other durations (3 months, 6 months, 1 year)
      //   const currentMonth = obj.endDate.getMonth(); // Get the current month (0-11)
      //   obj.endDate.setMonth(currentMonth + duration.value); // Add the duration in months

      //   // Adjust the year if the month overflows (i.e., exceeds December)
      //   if (obj.endDate.getMonth() < currentMonth) {
      //     obj.endDate.setFullYear(obj.endDate.getFullYear() + 1);
      //   }
      // }

      // obj.active = true;

      // Create new subscription
      const subscription = new SubscriptionModel({
        planId: plan._id,
        userId: user._id,
        active: false,
      });
      await subscription.save();

      return res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        data: subscription,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Error creating subscription', details: error.message });
    }
  }
  // DELETE a plan by ID
  async deletePlan(req: Request, res: Response) {
    const { id } = req.params; // Extract plan ID from request parameters
    try {
      const deletedPlan = await PlansModel.findByIdAndDelete(id);
      if (!deletedPlan) {
        return res.status(404).json({ error: 'Plan not found for deletion' });
      }
      return res.status(200).json({ msg: 'Plan deleted successfully' });
    } catch (error) {
      return res
        .status(500)
        .json({ error: 'Error deleting plan', details: error });
    }
  }
  async getSubscription(req: Request, res: Response) {
    const obj = {};
    addProperty(req, obj, 'id');
    console.log('obj', obj);
    const subscription = await SubscriptionModel.findOne(obj, {
      _id: 0,
      id: 0,
    });
    return res.status(200).json({ subscription });
  }
  async getMySubscription(req: Request, res: Response) {
    const obj: any = {};
    // addProperty(req, obj, 'account', 'address');
    addProperty(req, obj, 'address');
    obj.address = obj?.address?.toLowerCase();
    const user = await AccountModel.findOne(obj);
    console.log('user', user);
    const subscription = await SubscriptionModel.find({
      userId: user._id,
      active: true,
    })
      // .populate('userId')  // Populates the Account details
      .populate('planId'); // Populates the Plan details
    return res.status(200).json({ subscription });
  }
  async webhookPlanCreate(req: Request, res: Response) {
    const planId = reqParam(req, 'planId');
    const isSuccess = reqParam(req, 'isSuccess');
    const chainId = reqParam(req, 'chainId');
    const address = reqParam(req, 'address');

    const plan = await PlansModel.findOneAndUpdate(
      {
        id: planId,
        'chains.chainId': chainId, // Match the chainId in the chains array
        address: address.toLowerCase(), // Match the creator address (lowercased)
      },
      {
        $set: {
          'chains.$.status': isSuccess, // Set status to true (active)
          'chains.$.isPublished': isSuccess, // Set isPublished to true
        },
      },
      { new: true }, // Return the updated document
    );
    if (!plan) {
      this.logger.warn(
        `No plan found for id: ${planId.toString()} on chainId: ${chainId}`,
      );
      return res.status(404).json({ error: 'Plan not found' });
    } else {
      this.logger.log(
        `Plan updated successfully for id: ${planId.toString()} on chainId: ${chainId}`,
      );
      this.activityService.onPlanPublished(plan);
      return res.status(200).json({ message: 'Plan Successful Created' });
    }
  }
  async webhookPlanPurchased(req: Request, res: Response) {
    const subId = reqParam(req, 'subId');
    const isSuccess = reqParam(req, 'isSuccess');
    const hash = reqParam(req, 'hash');

    if (isSuccess === false) {
      return res.status(400).json({ error: 'Transaction failed' });
    }
    // Find the subscription by id
    const subscription = await SubscriptionModel.findOne({
      id: subId.toString(),
    });

    if (!subscription) {
      this.logger.error(`Subscription not found for id: ${subId.toString()}`);
      return;
    }

    if (subscription.active) {
      this.logger.error(
        `Subscription already active for id: ${subId.toString()}`,
      );
      return res.status(400).json({ error: 'Subscription already active' });
    }

    if (subscription.active && subscription.endDate < new Date()) {
      this.logger.error(`Subscription expired for id: ${subId.toString()}`);
      return res.status(400).json({ error: 'Subscription expired' });
    }
    // Find the plan associated with the subscription
    const plan = await PlansModel.findById(subscription.planId);

    if (!plan) {
      this.logger.error(
        `Plan not found for planId: ${subscription.planId.toString()}`,
      );
      return res.status(404).json({ error: 'Plan not found' });
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
    const updatedSubscription = await SubscriptionModel.findOneAndUpdate(
      { id: subId.toString() },
      {
        $set: {
          startDate: startDate,
          endDate: endDate,
          active: true,
        },
      },
      { new: true },
    );

    if (updatedSubscription) {
      this.logger.log(
        `Subscription updated with startDate and endDate for id: ${subId.toString()}`,
      );
      this.activityService.onPlanPurchased(updatedSubscription);
      return res.status(200).json({ message: 'Subscription Successful' });
    } else {
      this.logger.error(
        `Failed to update subscription with id: ${subId.toString()}`,
      );
      return res.status(404).json({ error: 'Failed to update subscription' });
    }
  }
}