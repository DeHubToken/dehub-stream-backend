import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from 'common/guards/auth.guard';
import { ReactionService } from './reaction.service';

@Controller()
export class ReactionsController {
  constructor(private readonly reactionsService: ReactionService) {}

  @Get('/get_reactions')
  async getReaction(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.reactionsService.getReactions(req,res);
      return res.json(result);
    } catch (error) {
      console.error('-----request like error', error);
      return res.status(500).json({ result: false, error: 'Like request failed' });
    }
  }
  @Get('/request_like')
  @UseGuards(AuthGuard)
  async requestLike(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.reactionsService.requestLike(req,res);
      return res.json(result);
    } catch (error) {
      console.error('-----request like error', error);
      return res.status(500).json({ result: false, error: 'Like request failed' });
    }
  }

  @Get('/request_tip')
  @UseGuards(AuthGuard)
  async requestTip(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.reactionsService.requestTip(req,res);
      return res.json(result);
    } catch (error) {
      console.error('-----request tip error', error);
      return res.status(500).json({ result: false, error: 'Tip request failed' });
    }
  }

  @Get('/request_comment')
  @UseGuards(AuthGuard)
  async requestComment(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.reactionsService.requestComment(req,res);
      return res.json(result);
    } catch (error) {
      console.error('-----request comment error', error);
      return res.status(500).json({ result: false, error: 'Comment request failed' });
    }
  }

  @Get('/request_vote')
  @UseGuards(AuthGuard)
  async requestVote(@Req() req: Request, @Res() res: Response) {
      return this.reactionsService.requestVote(req,res);
  }

  @Get('/request_follow')
  @UseGuards(AuthGuard)
  async requestFollow(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.reactionsService.requestFollow(req,res);
      return res.json(result);
    } catch (error) {
      console.error('-----request follow error', error);
      return res.status(500).json({ result: false, error: 'Follow request failed' });
    }
  }

  @Get('/request_reaction')
  @UseGuards(AuthGuard)
  async requestReaction(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.reactionsService.requestReaction(req,res);
      return res.json(result);
    } catch (error) {
      console.error('-----request follow error', error);
      return res.status(500).json({ result: false, error: 'Follow request failed' });
    }
  }
}
