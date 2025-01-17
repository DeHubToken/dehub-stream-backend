import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isValidAccount } from 'common/util/auth';

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly jwtService: JwtService;

  constructor() {
    this.jwtService = new JwtService({ secret: process.env.JWT_SECRET_KEY || 'your_secret_key' })
  }

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token;

    // if (!token) {
    //   throw new UnauthorizedException('Token is required for authentication');
    // }
    if (token) {
      try {
        const decoded = this.jwtService.verify(token, { secret: process.env.JWT_SECRET_KEY || 'your_secret_key' });
        client.data.user = decoded;
        return true;
      } catch (error) {
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

      client.data.user = { address, sig, timestamp};
      return true
    }
  }
}
