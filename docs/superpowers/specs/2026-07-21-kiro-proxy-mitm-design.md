# Kiro Proxy with MITM Hero Adapter - Design Specification

**Date:** 2026-07-21  
**Status:** Approved for Implementation

## Overview

Build a complete Kiro AI proxy by copying 9router's proven MITM architecture and UI, adapted specifically for Kiro. This provides seamless interception of IDE/CLI traffic with account import/export, tier detection, and custom endpoint support.

## Architecture

Copy 9router's three-layer architecture:

```
IDE/CLI Tools → MITM Proxy (port 443) → API Proxy (port 20127) → Kiro AI
```

### 1. MITM Proxy Layer (from 9router)

**Source:** `9router/src/mitm/`

- **Server** (`server.js` ~150 lines): HTTPS server with self-signed certificate generation
- **Kiro Handler** (`handlers/kiro.js` 526 lines): AWS EventStream parser, thinking extraction, OpenAI SSE transformation
- **Base Handler** (`handlers/base.js` 225 lines): `fetchRouter()` and `pipeTransformedSSE()` utilities
- **Certificate Gen** (`cert/generate.js` 32 lines): Self-signed CA and domain cert generation

**How it works:**
1. Intercepts HTTPS traffic using SNI callback
2. Transforms Kiro-specific requests to OpenAI format
3. Forwards to main API proxy at localhost:20127
4. Transforms responses back to expected format

### 2. API Proxy Layer (existing + enhancements)

**Current:** OpenAI-compatible endpoint at port 20127 with Kiro OAuth and account management

**Add:**
- Account import/export from 9router/OMNIROUTER JSON format
- Automatic tier detection (free/pro/enterprise) via test requests
- Request queue with 50 concurrent limit
- Rate limiting with exponential backoff
- Custom endpoint support (OpenAI/Anthropic compatible)

### 3. Frontend (copy 9router UI exactly)

**Source:** `9router/src/` app routes and components

**Features:**
- Dashboard with account management
- Import/export UI (supports 9router, OMNIROUTER, lln proxy formats)
- Tier verification and testing
- API key generation (`SK-proxy-{random-hex}`)
- Usage monitoring and statistics
- Custom endpoint configuration
- Model testing interface

## Key Features

### Account Import/Export

**Import from:**
- 9router JSON exports
- OMNIROUTER account files
- lln proxy formats
- Manual entry (OAuth, API key, browser session)

**Merge behavior:** When importing, existing accounts are replaced/updated based on account ID. If importing 20 accounts from 9router and 100 from OMNIROUTER, all 120 are added (duplicates merged).

### Tier Detection System

**Problem:** Imported accounts don't carry tier information. A pro account from 9router might be treated as free tier.

**Solution:** Auto-detect tier by making test requests:
1. On account import, send minimal test request
2. Check response headers/rate limits
3. Classify as: free, pro, or enterprise
4. Store tier metadata with account
5. Use tier info for routing and rate limiting

### API Key Generation

Format: `SK-proxy-{32-char-hex}`

- Generated via UI
- Stored in account database
- Used for authentication to the proxy
- Supports both local and remote access

### Custom Endpoint Support

Allow users to configure custom API endpoints:
- OpenAI-compatible format
- Anthropic-compatible format
- Add via UI or config file
- Test endpoint before saving

### Rate Limiting & Queue

- **50 concurrent requests** maximum
- **Per-tier rate limits:** free (10/min), pro (100/min), enterprise (1000/min)
- **Queue system:** Requests beyond limit are queued
- **Retry logic:** Exponential backoff on 429/503 errors
- **Timeout handling:** 30s request timeout, retry up to 3 times

### Domain Sharing

Support remote access via tunnel:
- User provides custom domain or uses tunnel (ngrok/cloudflared)
- MITM proxy auto-connects via configured tunnel
- API endpoint accessible globally
- Same UI for local and remote management

## Implementation Plan

### Phase 1: Copy MITM Proxy Core
1. Copy cert generation from 9router
2. Copy MITM server setup
3. Copy base handler utilities
4. Copy Kiro handler (526 lines)
5. Integrate with existing API proxy

### Phase 2: Account Management
1. Import/export UI (copy from 9router)
2. Tier detection logic
3. Account testing interface
4. Multi-format import support

### Phase 3: API & Queue System
1. API key generation
2. Request queue (50 concurrent)
3. Rate limiting per tier
4. Custom endpoint configuration

### Phase 4: UI Polish
1. Copy 9router dashboard layout
2. Usage statistics and monitoring
3. Model testing interface
4. Settings and configuration

## Files to Copy from 9router

**MITM Core:**
- `src/mitm/server.js`
- `src/mitm/handlers/kiro.js` ✅ Downloaded
- `src/mitm/handlers/base.js` ✅ Downloaded
- `src/mitm/cert/generate.js` ✅ Downloaded
- `src/mitm/config.js`
- `src/mitm/logger.js`

**UI Components:**
- Dashboard layout
- Account management pages
- Settings pages
- Import/export modals

**Database/Storage:**
- Account schema
- Usage tracking
- Configuration storage

## Technical Notes

- No 350-line write limit in 9router code (verified)
- MITM requires certificate installation (one-time setup)
- Windows: May need elevation for port 443 binding
- All code is open-source MIT licensed (9router)

## Success Criteria

1. ✅ MITM proxy intercepts Kiro traffic automatically
2. ✅ Accounts can be imported from 9router/OMNIROUTER
3. ✅ Tier detection works accurately
4. ✅ UI matches 9router quality and features
5. ✅ 50 concurrent requests handled smoothly
6. ✅ Rate limiting prevents flooding
7. ✅ Custom endpoints configurable
8. ✅ Works both locally and via remote tunnel

## Next Steps

After approval:
1. Create detailed implementation plan
2. Begin Phase 1: MITM proxy core
3. Test with real Kiro accounts
4. Iterate on UI/UX
