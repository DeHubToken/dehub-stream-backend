import { Controller, Get, Post, Body, Patch, Param, Delete, Req, Res } from '@nestjs/common';
import { CategoryService } from './category.service';
import { Request, Response } from 'express';

@Controller()
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post("add_category")
  create(@Req() req:Request, @Res() res:Response) {
    return this.categoryService.create(req, res);
  }

}
