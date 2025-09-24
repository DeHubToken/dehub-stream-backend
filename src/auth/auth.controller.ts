import { Controller, Post, Get, Req, Res, UseGuards, Body, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from 'common/guards/auth.guard';
import { AuthService } from './auth.service';

@Controller() // Adjust the route prefix as necessary
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signinWithWallet')
  @UseGuards(AuthGuard)
  async signWithWallet(@Req() req: Request, @Res() res: Response) {
    try {
      console.log("signinWithWallet")
      const result = await this.authService.signWithWallet(req,res);
      return res.json(result);
    } catch (error:   any & { message: string }) {
      return res.status(500).json({ error: true, message: error.message });
    }
  }

  @Post('loginWithWallet')
  @UseGuards(AuthGuard)
  async login(@Req() req: Request, @Res() res: Response) {
    console.log("loginWithWallet")
    try {
      return await this.authService.login(req, res); 
    } catch (error: any & { message: string }) {
      return res.status(500).json({ error: true, message: error.message });
    }
  }

  @Post('mobile/auth')
  @UseGuards(AuthGuard)
  async mobileAuth(@Req() req: Request, @Res() res: Response) {
    try {
      console.log("Mobile JWT authentication");
      // Service method already writes to res
      await this.authService.mobileAuth(req, res);
      return;
    } catch (error: any & { message: string }) {
      return res.status(500).json({ error: true, message: error.message });
    }
  }

  @Get('username/check')
  async checkUsernameGet(@Query('username') username: string, @Res() res: Response) {
    const result = await this.authService.checkUsernameAvailability(username);
    if (!result.status) {
      return res.status(result.code || 400).json(result);
    }
    return res.json(result);
  }

  // (Optional) Keep POST for backward compatibility; can be removed later.
  @Post('username/check')
  async checkUsernamePost(@Body('username') username: string, @Res() res: Response) {
    const result = await this.authService.checkUsernameAvailability(username);
    if (!result.status) {
      return res.status(result.code || 400).json(result);
    }
    return res.json(result);
  }
}
