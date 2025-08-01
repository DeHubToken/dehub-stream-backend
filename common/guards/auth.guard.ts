import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ethers } from 'ethers';
import multer from 'multer';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwtService: JwtService;
  private readonly webExpireSecond: number;
  private readonly mobileExpireSecond: number;
  private readonly secretKey: string;

  constructor() {
    this.jwtService = new JwtService({ secret: process.env.JWT_SECRET_KEY || 'your_secret_key' });
    this.webExpireSecond = process.env.NODE_ENV === 'development' ? 60 * 60 * 24 : 60 * 60 * 24; // 2 hours in dev, 24 hours in prod
    this.mobileExpireSecond = 60 * 60 * 24 * 365 * 1; // 1 year for mobile (essentially never expires)
    this.secretKey = process.env.JWT_SECRET_KEY || 'your_secret_key';
    console.info(`🔹 Signature expires in ${this.webExpireSecond / 3600} hr | Environment: ${process.env.NODE_ENV}`);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const request: any = await new Promise((resolve, reject) => {
      multer().any()(req, {} as any, function (err) {
        if (err) reject(err);
        resolve(req);
      });
    });

    const token = this.extractTokenFromHeader(request);

    if (token) {
      // Token is present; verify it
      try {
        const decodedToken = this.jwtService.verify(token, { secret: this.secretKey });
        request.params.address = decodedToken.address.toLowerCase();
        request.params.rawSig = decodedToken.rawSig;
        request.params.timestamp = decodedToken.timestamp;
        request.params.isMobile = decodedToken.isMobile || false;
        request.user = {
          address: decodedToken.address.toLowerCase(),
          rawSig: decodedToken.rawSig,
          timestamp: decodedToken.timestamp,
          isMobile: decodedToken.isMobile || false,
        };
        return true;
      } catch (error: any & { message: string }) {
        throw new UnauthorizedException('Invalid authorization token');
      }
    } else {
      // Token is absent; extract parameters from the request
      const { address, rawSig, timestamp, isMobile } = this.extractParams(request);
      if (!rawSig || !address || !timestamp) {
        throw new BadRequestException('Invalid signature');
      }

      // Validate the provided credentials
      if (!this.isValidAccount(address, timestamp, rawSig, isMobile)) {
        throw new UnauthorizedException('Invalid signature');
      }

      // Generate a new token
      const generatedToken = this.generateToken(address, rawSig, timestamp, isMobile);
      request.params.address = address.toLowerCase();
      request.params.rawSig = rawSig;
      request.params.timestamp = timestamp;
      request.params.isMobile = isMobile;
      request.generatedToken = generatedToken;
      request.user = {
        address: address.toLowerCase(),
        rawSig: rawSig,
        timestamp: timestamp,
        isMobile: isMobile,
      };
      return true;
    }
  }

  private extractTokenFromHeader(request): string | null {
    const authHeader = request.headers.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  }

  private extractParams(request): { address: string; rawSig: string; timestamp: number; isMobile?: boolean } {
    const address = request.query.address || request.body.address || request.params.address;
    const rawSig = request.query.sig || request.body.sig || request.params.sig;
    const timestamp = request.query.timestamp || request.body.timestamp || request.params.timestamp;
    const isMobile =
      request.query.isMobile ||
      request.body.isMobile ||
      request.params.isMobile ||
      request.headers['x-client-type'] === 'mobile' ||
      false;

    return { address, rawSig, timestamp: Number(timestamp), isMobile: Boolean(isMobile) };
  }

  private isValidAccount(address: string, timestamp: number, sig: string, isMobile: boolean = false): boolean {
    if (!sig || !address || !timestamp) {
      return false;
    }

    const expireSecond = isMobile ? this.mobileExpireSecond : this.webExpireSecond;

    const signedMsg = this.generateSignMessage(address, timestamp, isMobile);

    try {
      const signedAddress = ethers.verifyMessage(signedMsg, sig).toLowerCase();
      const nowTime = Math.floor(Date.now() / 1000);
      if (nowTime - expireSecond > timestamp || signedAddress.toLowerCase() !== address.toLowerCase()) {
        console.log(
          `Signature validation failed: ${isMobile ? 'Mobile' : 'Web'} signature expired or address mismatch`,
          {
            nowTime,
            timestamp,
            expireSecond,
            signedAddress,
            expectedAddress: address.toLowerCase(),
            expired: nowTime - expireSecond > timestamp,
          },
        );
        return false;
      }
      return true;
    } catch (e) {
      console.error('Error verifying account:', e);
      return false;
    }
  }

  private generateSignMessage(address: string, timestamp: number, isMobile: boolean = false): string {
    const expireSecond = isMobile ? this.mobileExpireSecond : this.webExpireSecond;
    const displayedDate = new Date(timestamp * 1000);
    const validityText = isMobile ? 'until you log out' : `${expireSecond / 3600} hours`;

    return `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for ${validityText}.\nYour wallet address is ${address.toLowerCase()}.\nIt is ${displayedDate.toUTCString()}.`;
  }

  private generateToken(address: string, rawSig: string, timestamp: number, isMobile: boolean = false): string | null {
    if (!address || !rawSig || !timestamp) {
      return null;
    }
    // Generate longer-lived tokens for mobile
    // const expiresIn = isMobile ? '1y' : '3d'; // 1 year for mobile, 3 days for web
    const expiresIn = isMobile ? `${this.mobileExpireSecond}s` : `${this.webExpireSecond}s`;
    return this.jwtService.sign({ address, rawSig, timestamp, isMobile }, { expiresIn, secret: this.secretKey });
  }
}
