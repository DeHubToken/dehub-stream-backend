import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ethers } from 'ethers';
import multer from 'multer';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwtService: JwtService;
  private readonly expireSecond: number;
  private readonly secretKey: string;

  constructor() {
    this.jwtService = new JwtService({ secret: process.env.JWT_SECRET_KEY || 'your_secret_key' })
    this.expireSecond = process.env.NODE_ENV === 'development' ? 60 * 60 * 2 : 60 * 60 * 24; // 2 hours in dev, 24 hours in prod
    this.secretKey = process.env.JWT_SECRET_KEY || 'your_secret_key';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest ();
    const request:any = await new Promise((resolve, reject) => {
      multer().any()(req, {} as any, function(err) {
        if (err) reject(err);
        resolve(req);
      });
    });

    const token = this.extractTokenFromHeader(request)
   
    if (token) {
      // Token is present; verify it
      try {
        const decodedToken = this.jwtService.verify(token, { secret: this.secretKey });
        request.params.address = decodedToken.address.toLowerCase();
        request.params.rawSig = decodedToken.rawSig;
        request.params.timestamp = decodedToken.timestamp;
        return true;
      } catch (error) {
        throw new UnauthorizedException('Invalid authorization token');
      }
    } else {
      // Token is absent; extract parameters from the request
      const { address, rawSig, timestamp } = this.extractParams(request);
      if (!rawSig || !address || !timestamp) {
        throw new BadRequestException('Signature, address, and timestamp are required');
      }

      // Validate the provided credentials
      if (!this.isValidAccount(address, timestamp, rawSig)){
        throw new UnauthorizedException('Invalid credentials');
      }

      // Generate a new token
      const generatedToken = this.generateToken(address, rawSig, timestamp);
      request.params.address = address.toLowerCase();
      request.params.rawSig = rawSig;
      request.params.timestamp = timestamp;
      request.generatedToken = generatedToken;

      return true;
    }
  }

  private extractTokenFromHeader(request): string | null {
    const authHeader = request.headers.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  }

  private extractParams(request): { address: string; rawSig: string; timestamp: number } {
    const address = request.query.address || request.body.address || request.params.address;
    const rawSig = request.query.sig || request.body.sig || request.params.sig;
    const timestamp = request.query.timestamp || request.body.timestamp || request.params.timestamp;
    return { address, rawSig, timestamp: Number(timestamp) };
  }

  private isValidAccount(address: string, timestamp: number, sig: string): boolean {
    if (!sig || !address || !timestamp) {
      return false;
    }

    const displayedDate = new Date(timestamp * 1000);
    const signedMsg = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for ${this.expireSecond / 3600} hours.\nYour wallet address is ${address.toLowerCase()}.\nIt is ${displayedDate.toUTCString()}.`;

    try {
      const signedAddress = ethers.verifyMessage(signedMsg, sig).toLowerCase();
      const nowTime = Math.floor(Date.now() / 1000);
      // console.log(signedAddress, address)
      // Check if the signature is expired or does not match the address
      if (nowTime - this.expireSecond > timestamp || signedAddress.toLowerCase() !== address.toLowerCase()) {
        return false;
      }
      return true;
    } catch (e) {
      console.error('Error verifying account:', e);
      return false;
    }
  }

  private generateToken(address: string, rawSig: string, timestamp: number): string | null {
    if (!address || !rawSig || !timestamp) {
      return null;
    }
    return this.jwtService.sign({ address, rawSig, timestamp }, { expiresIn: '3d', secret: this.secretKey });
  }
}