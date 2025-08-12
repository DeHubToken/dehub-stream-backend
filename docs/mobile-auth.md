# Mobile JWT Authentication & Account Creation Endpoint

## Overview
The `/mobile/auth` endpoint serves a dual purpose:
1. **Authentication**: Provides JWT tokens for existing accounts
2. **Account Creation**: Automatically creates new accounts for valid Ethereum addresses

## Endpoint
```
POST /mobile/auth
```

## Request Methods

### Method 1: Using Signature Parameters (First Time)
Send the signature parameters in the request body, query parameters, or headers:

```bash
curl -X POST http://localhost:3000/mobile/auth \
  -H "Content-Type: application/json" \
  -H "x-client-type: mobile" \
  -d '{
    "address": "0x1234567890123456789012345678901234567890",
    "sig": "0xabcdef...",
    "timestamp": 1690934400,
    "isMobile": true
  }'
```

### Method 2: Using JWT Token (Subsequent Requests)
Send the JWT token in the Authorization header:

```bash
curl -X POST http://localhost:3000/mobile/auth \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Response Format

### Success Response (New Account)
```json
{
  "status": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "result": {
    "address": "0x1234567890123456789012345678901234567890",
    "isMobile": true,
    "lastLoginTimestamp": 1690934400000,
    "tokenExpiry": "1 year",
    "isNewAccount": true,
    "accountCreated": "2025-08-02T12:00:00.000Z"
  },
  "message": "Account created and authenticated successfully"
}
```

### Success Response (Existing Account)
```json
{
  "status": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "result": {
    "address": "0x1234567890123456789012345678901234567890",
    "isMobile": true,
    "lastLoginTimestamp": 1690934400000,
    "tokenExpiry": "1 year",
    "isNewAccount": false,
    "accountCreated": "2025-07-01T10:30:00.000Z"
  },
  "message": "Mobile authentication successful"
}
```

### Error Response
```json
{
  "error": true,
  "message": "Invalid signature"
}
```

### Invalid Address Error
```json
{
  "status": false,
  "error": true,
  "error_message": "Invalid Ethereum address format"
}
```

## Token Expiration
- **Mobile tokens**: 1 year (long-lived for better UX)
- **Web tokens**: 24 hours (shorter for security)

## Authentication & Account Creation Flow
1. Client signs a message with their wallet
2. Client sends signature + parameters to `/mobile/auth`
3. Server validates signature using AuthGuard
4. **If valid Ethereum address**: Server creates account automatically (if new) or updates existing account
5. Server generates JWT token with 1-year expiration
6. Client stores token for subsequent requests
7. Client uses token in Authorization header for future requests

## Account Creation Features
- **Automatic**: No separate registration endpoint needed
- **Validation**: Validates Ethereum address format using ethers.js `isAddress()`
- **Default Values**: Sets appropriate defaults for new accounts:
  - `sentTips`: 0
  - `receivedTips`: 0  
  - `uploads`: 0
  - `followers`: 0
  - `likes`: 0
  - `online`: true
  - `seenModal`: false
- **Response Indicators**: 
  - `isNewAccount`: boolean indicating if account was just created
  - `accountCreated`: timestamp of account creation

## Message Format for Signing
The message that needs to be signed by the wallet:
```
Welcome to DeHub!

Click to sign in for authentication.
Signatures are valid for until you log out.
Your wallet address is 0x1234567890123456789012345678901234567890.
It is Fri, 02 Aug 2025 12:00:00 GMT.
```

## Security Features
- Signature validation using ethers.js
- JWT token with configurable expiration
- Mobile-specific long-lived tokens
- Timestamp validation to prevent replay attacks
- Address verification to ensure signature authenticity
