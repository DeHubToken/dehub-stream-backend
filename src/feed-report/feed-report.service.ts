import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { FeedReportsModel } from 'models/feed-reports';

@Injectable()
export class FeedReportService {
  async addReport(req: Request, res: Response) {
    try {
      const address = reqParam(req, 'address');
      const description = reqParam(req, 'description');
      const tokenId = reqParam(req, 'tokenId');
      // Validate required fields
      if (!address || !tokenId || !description) {
        return res.status(400).json({ message: 'Please provide all required details' });
      }

      // Ensure the user exists
      const user = await AccountModel.findOne({ address: address.toLowerCase() }, { _id: 1 });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Check if the report already exists
      const existingReport = await FeedReportsModel.findOne({ tokenId, userId: user._id });
      if (existingReport) {
        return res.status(400).json({ message: 'You have already reported this' });
      }
      const newReport = new FeedReportsModel({
        description,
        tokenId,
        userId: user._id,
      });
      await newReport.save();
      return res.status(201).json({ message: 'Report added successfully', report: newReport });
    } catch (error) {
      return res.status(500).json({ message: 'Error adding report', error: error.message });
    }
  }

  async fetchFeedReports(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const reports = await FeedReportsModel.find().populate('userId').skip(skip).limit(limit).sort({ createdAt: -1 });

      const totalReports = await FeedReportsModel.countDocuments();
      return res.status(200).json({
        total: totalReports,
        page,
        limit,
        reports,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Error fetching reports', error: error.message });
    }
  }

  async fetchReportByTokenId(req: Request, res: Response) {
    try {
      const tokenId = Number(reqParam(req, 'tokenId'));
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      // Validate tokenId
      if (!tokenId) {
        return res.status(400).json({ message: 'Please provide a valid tokenId' });
      }

      // Use aggregation to fetch reports associated with the given tokenId
      // Count total reports for the given tokenId
      const totalReports = await FeedReportsModel.countDocuments({ tokenId });
      const reports = await FeedReportsModel.aggregate([
        {
          $match: { tokenId }, // Match reports with the given tokenId
        },
        {
          $lookup: {
            from: 'accounts', // Assuming the user details are in the 'accounts' collection
            localField: 'userId',
            foreignField: '_id',
            as: 'userDetails', // Populating user details
          },
        },
        {
          $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true }, // Unwind the user details array
        },
        {
          $sort: { createdAt: -1 }, // Sort by creation date in descending order
        },
        {
          $skip: skip, // Skip results based on the current page
        },
        {
          $limit: limit, // Limit the number of results per page
        },
        {
          $project: {
            _id: 1,
            tokenId: 1,
            description: 1,
            createdAt: 1,
            updatedAt: 1,
            'userDetails.username': 1, // Include username from populated user details
            'userDetails.avatarImageUrl': 1, // Include avatarImageUrl from populated user details
            'userDetails.address': 1, // Include address from populated user details
            'userDetails._id': 1, // Include userId
          },
        },
      ]);

      // Check if reports exist
      if (!reports || reports.length === 0) {
        return res.status(404).json({ message: `No reports found for tokenId ${tokenId}` });
      }

      // Return reports
      return res.status(200).json({
        message: 'Reports fetched successfully',
        totalReports,
        reports,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Error fetching reports', error: error.message });
    }
  }
}
