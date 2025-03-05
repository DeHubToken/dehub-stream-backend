import { Module } from '@nestjs/common'; 
import { BuySellCryptoController } from './buy-sell-crypto.controller';
import { BuySellCryptoService } from './buy-sell-crypto.service';
@Module({
  controllers: [BuySellCryptoController],
  providers: [BuySellCryptoService], 
  exports:[BuySellCryptoService]
})
export class BuySellCryptoModule {}