import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isValidAccount } from 'common/util/auth';
import { AccountModel } from 'models/Account';

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly jwtService: JwtService;

  constructor() {
    this.jwtService = new JwtService({ secret: process.env.JWT_SECRET_KEY || 'your_secret_key' })
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token;

    // if (!token) {
    //   throw new UnauthorizedException('Token is required for authentication');
    // }
    if (token) {
      try {
        const decoded = this.jwtService.verify(token, { secret: process.env.JWT_SECRET_KEY || 'your_secret_key' });
        const details = await this.fetchUserDetails(decoded.address)
        client.data.user = {...decoded, ...details};
        return true;
      } catch (error: any & { message: string }) {
        throw new UnauthorizedException('Invalid token');
      }
    } else {
      const address = client.handshake?.auth?.address;
      const sig = client.handshake?.auth?.sig;
      const timestamp = client.handshake?.auth?.timestamp;

      if (!sig || !address || !timestamp) {
        throw new BadRequestException('Signature, address, and timestamp are required');
      }

      // Validate the provided credentials
      if (!isValidAccount(address, timestamp, sig)) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const details = await this.fetchUserDetails(address)
      client.data.user = { address, sig, timestamp, ...details};
      return true
    }
  }

  async fetchUserDetails (address) {
    const user = await AccountModel.findOne({ address }).select('username').lean();
    return {username: user.username || null}
  }
}
