import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { paramNames } from 'config/constants';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';

@Injectable()
export class AuthService {

  async  signWithWallet(req:Request, res:Response) {
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
    } catch (e) {
      return res.status(500).json({ error: true, message: 'Sign Error' });
    }
  }

  async login (req:Request, res:Response) {
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
      const rep:any = req
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
}
