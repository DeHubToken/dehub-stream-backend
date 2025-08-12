export type LowerCaseType = {
    type: String,
    lowercase: true
}
export const LowerCaseType = {
    type: String,
    lowercase: true
}

// Authentication types
export interface MobileAuthRequest {
  address: string;
  sig: string;
  timestamp: number;
  isMobile?: boolean;
}

export interface MobileAuthResponse {
  status: boolean;
  token?: string;
  result?: {
    address: string;
    isMobile: boolean;
    lastLoginTimestamp: number;
    tokenExpiry: string;
    isNewAccount?: boolean;
    accountCreated?: Date;
  };
  message?: string;
  error?: boolean;
  error_message?: string;
}

export interface AuthUser {
  address: string;
  rawSig: string;
  timestamp: number;
  isMobile: boolean;
}
