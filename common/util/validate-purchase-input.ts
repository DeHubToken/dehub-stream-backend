import { HttpStatusCode } from 'axios'; 
import { currencyInfoMap, symbolToIdMap } from 'src/dehub-pay/constants';

interface ValidationResult {
  errors: { status: number; message: string }[];
  validated: {
    chainId: number;
    tokenSymbol: string;
    currency: string;
    tokensToReceive: number;
    tokenId: string;
    amount:number;
    currencyLimits?: { minLimit: number; maxLimit: number };
  };
}

export function validatePurchaseInput(body: any): ValidationResult {
  const errors: { status: number; message: string }[] = [];

  let { chainId, tokenSymbol, currency, tokensToReceive,amount } = body;

  // Type validations
  if (!chainId || typeof chainId !== 'number') {
    errors.push({
      status: HttpStatusCode.BadRequest,
      message: '`chainId` is required and must be a string.',
    });
  }

  if (!tokenSymbol || typeof tokenSymbol !== 'string') {
    errors.push({
      status: HttpStatusCode.BadRequest,
      message: '`tokenSymbol` is required and must be a string.',
    });
  }

  if (currency && typeof currency !== 'string') {
    errors.push({
      status: HttpStatusCode.BadRequest,
      message: '`currency` must be a string if provided.',
    });
  }

  if (
    tokensToReceive === undefined ||
    tokensToReceive === null ||
    typeof tokensToReceive !== 'number' ||
    tokensToReceive <= 0
  ) {
    errors.push({
      status: HttpStatusCode.BadRequest,
      message: '`tokensToReceive` is required and must be a positive number.',
    });
  }

  // Normalize and lookup
  currency = currency?.toLowerCase()
  const tokenId = symbolToIdMap[tokenSymbol] ?? tokenSymbol;
  const currencyLimits = currencyInfoMap[currency];

  // Currency support check
  if (!currencyLimits) {
    errors.push({
      status: HttpStatusCode.BadRequest,
      message: `Unsupported currency '${currency}'. Supported: ${Object.keys(currencyInfoMap).join(', ')}.`,
    });
  }

  return {
    errors,
    validated: {
      chainId,
      tokenSymbol,
      currency,
      amount,
      tokensToReceive,
      tokenId,
      currencyLimits,
    },
  };
}
