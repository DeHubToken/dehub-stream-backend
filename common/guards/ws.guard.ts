import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ethers } from 'ethers';
import { AccountModel } from 'models/Account';

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly jwtService: JwtService;
  private readonly webExpireSecond: number;
  private readonly mobileExpireSecond: number;
  private readonly secretKey: string;

  constructor() {
    this.jwtService = new JwtService({ secret: process.env.JWT_SECRET_KEY || 'your_secret_key' });
    this.webExpireSecond = process.env.NODE_ENV === 'development' ? 60 * 60 * 24 : 60 * 60 * 24; // same as HTTP guard
    this.mobileExpireSecond = 60 * 60 * 24 * 365 * 1; // 1 year for mobile
    this.secretKey = process.env.JWT_SECRET_KEY || 'your_secret_key';
    console.info(
      `🔹 [WS] Signature expires in ${this.webExpireSecond / 3600} hr | Environment: ${process.env.NODE_ENV}`,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const handshake = client.handshake || {};
    const token = handshake?.auth?.token || handshake?.query?.token || this.extractTokenFromHeader(handshake);

    console.log('WebSocket connection attempt with token:', { token: token?.slice(10) }, 'and handshake:', {
      // handshake,
    });
    if (token) {
      try {
        const decoded = this.jwtService.verify(token, { secret: this.secretKey });
        const details = await this.fetchUserDetails(decoded.address);
        client.data.user = {
          address: decoded.address?.toLowerCase(),
          rawSig: decoded.rawSig,
          // keep legacy alias for compatibility
          sig: decoded.rawSig,
          timestamp: decoded.timestamp,
          isMobile: decoded.isMobile || false,
          ...details,
        };
        return true;
      } catch (error: any & { message: string }) {
        throw new UnauthorizedException('Invalid token');
      }
    } else {
      const { address, rawSig, timestamp, isMobile } = this.extractParams(handshake);

      if (!rawSig || !address || !timestamp) {
        throw new BadRequestException('Invalid signature: incomplete signature parameters provided');
      }

      if (!this.isValidAccount(address, timestamp, rawSig, isMobile)) {
        throw new UnauthorizedException('Invalid signature: signature validation failed');
      }

      const generatedToken = this.generateToken(address, rawSig, timestamp, isMobile);
      const details = await this.fetchUserDetails(address);
      client.data.user = {
        address: address.toLowerCase(),
        rawSig,
        sig: rawSig, // legacy alias
        timestamp,
        isMobile,
        ...details,
      };
      client.data.generatedToken = generatedToken;
      return true;
    }
  }

  async fetchUserDetails(address: string) {
    const user = await AccountModel.findOne({ address: address?.toLowerCase?.() || address })
      .select('username')
      .lean();
    return { username: user?.username || null };
  }

  private extractTokenFromHeader(handshake: any): string | null {
    const authHeader = handshake?.headers?.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  }

  private extractParams(handshake: any): { address: string; rawSig: string; timestamp: number; isMobile?: boolean } {
    const address = handshake?.auth?.address || handshake?.query?.address;
    const rawSig = handshake?.auth?.rawSig || handshake?.auth?.sig || handshake?.query?.sig;
    const timestamp = handshake?.auth?.timestamp || handshake?.query?.timestamp;
    const isMobile =
      handshake?.auth?.isMobile ||
      handshake?.query?.isMobile ||
      handshake?.headers?.['x-client-type'] === 'mobile' ||
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
          `WS signature validation failed: ${isMobile ? 'Mobile' : 'Web'} signature expired or address mismatch`,
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
      console.error('WS error verifying account:', e);
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
    const expiresIn = isMobile ? `${this.mobileExpireSecond}s` : `${this.webExpireSecond}s`;
    return this.jwtService.sign({ address, rawSig, timestamp, isMobile }, { expiresIn, secret: this.secretKey });
  }
}
