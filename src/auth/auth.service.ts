import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { paramNames } from 'config/constants';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { MobileAuthResponse, AuthUser } from 'models/types/customTypes';
import { isAddress } from 'ethers';

@Injectable()
export class AuthService {

  async signWithWallet(req: Request, res: Response) {
    let address = reqParam(req, paramNames.address);
    address = address.toLowerCase();
    try {
      const account = await AccountModel.findOneAndUpdate(
        { address },
        { lastLoginTimestamp: Date.now() },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      if (!account)
        return res.status(404).json({ status: false, error: true, error_message: 'Not Found: Account not found' });
      return res.json({
        status: true,
        result: { address, lastLoginTimestamp: account.lastLoginTimestamp },
      });
    } catch (e: any & { message: string }) {
      return res.status(500).json({ error: true, message: 'Sign Error' });
    }
  }

  async login(req: Request, res: Response) {
    let address = reqParam(req, paramNames.address);
    address = address.toLowerCase();
    try {
      const account = await AccountModel.findOneAndUpdate(
        { address },
        { lastLoginTimestamp: Date.now() },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      if (!account)
        return res.status(404).json({ status: false, error: true, error_message: 'Not Found: Account not found' });
      const rep: any = req
      return res.json({
        token: rep.generatedToken,
        status: true,
        result: { address: address, lastLoginTimestamp: account.lastLoginTimestamp },
      });
    } catch (e) {
      console.log(e);
      return res.status(500).json({ error: true, message: 'Sign Error' });
    }
  }

  async mobileAuth(req: Request, res: Response) {
    let address = reqParam(req, paramNames.address);
    address = address.toLowerCase();
    
    try {
      // Validate Ethereum address format
      if (!isAddress(address)) {
        return res.status(400).json({ 
          status: false, 
          error: true, 
          error_message: 'Invalid Ethereum address format' 
        });
      }

      // Create or update account - this endpoint doubles as account creation
      const account = await AccountModel.findOneAndUpdate(
        { address },
        { 
          lastLoginTimestamp: Date.now(),
          // Set default values for new accounts
          $setOnInsert: {
            sentTips: 0,
            receivedTips: 0,
            uploads: 0,
            followers: 0,
            likes: 0,
            customs: {},
            online: true,
            seenModal: false
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();

      // Get the generated token from the request (set by AuthGuard)
      const req_any: any = req;
      const token = req_any.generatedToken;
      const user = req_any.user;

      if (!token) {
        return res.status(500).json({ 
          error: true, 
          message: 'Failed to generate authentication token' 
        });
      }

      // Determine if this was a new account creation
      // const isNewAccount = account.createdAt && 
      //   new Date(account.createdAt).getTime() > (Date.now() - 5000); // Created within last 5 seconds

      return res.json({
        status: true,
        token: token,
        result: {
          address: address,
          isMobile: user?.isMobile || true,
          lastLoginTimestamp: account.lastLoginTimestamp,
          tokenExpiry: user?.isMobile ? '1 year' : '24 hours',
          // isNewAccount: isNewAccount,
          // accountCreated: account.createdAt
        },
        // message: isNewAccount ? 'Account created and authenticated successfully' : 'Mobile authentication successful'
        message: "Account authenticated successfully"
      });

    } catch (error: any & { message: string }) {
      console.error('Mobile auth error:', error);
      
      // Handle duplicate key error (shouldn't happen with findOneAndUpdate, but just in case)
      if (error.code === 11000) {
        return res.status(409).json({ 
          error: true, 
          message: 'Account already exists' 
        });
      }
      
      return res.status(500).json({ 
        error: true, 
        message: 'Mobile authentication failed' 
      });
    }
  }
}
