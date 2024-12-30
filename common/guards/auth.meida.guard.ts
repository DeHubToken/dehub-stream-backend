import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ethers } from 'ethers';
import { config } from '../../config/index';
@Injectable()
export class MediaAuthGuard implements CanActivate {
  private readonly jwtService: JwtService;
  private readonly expireSecond: number;
  private readonly secretKey: string;
  private readonly cookieKey: string;

  constructor() {
    this.jwtService = new JwtService({ secret: process.env.JWT_SECRET_KEY || 'your_secret_key' });
    this.expireSecond = process.env.NODE_ENV === 'development' ? 60 * 60 * 2 : 60 * 60 * 24; // 2 hours in dev, 24 hours in prod
    this.secretKey = process.env.JWT_SECRET_KEY || 'your_secret_key';
    this.cookieKey = config.isDevMode ? 'data_dev' : 'data_v2';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const token = this.extractTokenFromHeader(request);

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
    }

    const { address, rawSig, timestamp } = this.extractParams(request);
 
    if (address && rawSig && timestamp) {
      // Token is absent; extract parameters from the request
      if (!rawSig || !address || !timestamp) {
        console.log('fffff', request);

        throw new BadRequestException('Signature, address, and timestamp are required');
      }

      // Validate the provided credentials
      if (!this.isValidAccount(address, timestamp, rawSig)) {
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
    return true;
 
  }
  private extractFromCookie = req => {
    const cookieKey = config.isDevMode ? 'data_dev' : 'data_v2';
    console.log('cookieKey', cookieKey);
    try {
      const cookie = req.cookies[cookieKey];
      console.log('cookie', cookie);
      if (cookie) {
        const parsedCookie = JSON.parse(cookie);
        console.log('Parsed cookie:', parsedCookie);
        // Extract dynamic address
        const address = Object.keys(parsedCookie).find(address => {
          return parsedCookie[address].isActive == true;
        }); // Get the dynamic address key
        const { timestamp, sig } = parsedCookie[address];
        console.log({ address, timestamp, sig });
        req.params.address = address.toLowerCase();
        req.params.timestamp = timestamp;
        req.params.rawSig = sig;
        req.params.isActive = sig;
        return { address: address.toLowerCase(), timestamp, rawSig: sig };
      } 
   
    } catch (error) {
      console.error('Error parsing cookie:', error.message);
    }
  };
  private extractTokenFromHeader(request): string | null {
    const authHeader = request.headers.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  }

  private extractParams(request): { address: string; rawSig: string; timestamp: number } {
    const address = request.query.address || request.body.address || request.params.address;
    const rawSig = request.query.sig || request.body.sig || request.params.sig;
    const timestamp = request.query.timestamp || request.body.timestamp || request.params.timestamp;

    // Check if the address, rawSig, or timestamp is invalid, then try to extract from the cookie
    if (!address || !rawSig || !timestamp) {
      const cookieParams = this.extractFromCookie(request); // Assuming this method returns an object { address, rawSig, timestamp }
      if (cookieParams) {
        return cookieParams; // Return the parameters from cookie
      }
    }

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
