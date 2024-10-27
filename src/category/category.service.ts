import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { overrideOptions } from 'config/constants';
import { Request, Response } from 'express';
import { CategoryModel } from 'models/Category';

@Injectable()
export class CategoryService {
  async create (req:Request, res:Response) {
    const name = reqParam(req, 'name');
    try {
      const result:any = await CategoryModel.updateOne({ name }, { name }, overrideOptions);
      if (result.upserted) return res.json({ result: true });
      else return res.status(409).json({ result: false, error: 'Already exists' });
    } catch (err) {
      console.log('-----add category error', err);
      return res.status(500).json({ result: false, error: 'Could not add Category' });
    }
  }
}