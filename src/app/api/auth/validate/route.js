/**
 * API Key Validation Endpoint
 *
 * POST /api/auth/validate
 *
 * Validates API keys against the store and returns key metadata.
 * Updates last_used_at timestamp on successful validation.
 *
 * Request:
 *   Authorization: Bearer SK-proxy-{32-char-hex}
 *
 * Response:
 *   { valid: boolean, keyId?: string, name?: string }
 */

import { NextResponse } from 'next/server';
import { validateKey } from '@/lib/api-keys/store';
import { isValidKeyFormat } from '@/lib/api-keys/generator';

/**
 * POST /api/auth/validate
 *
 * Validate an API key from the Authorization header
 */
export async function POST(request) {
  try {
    // Extract Authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Missing Authorization header',
        },
        { status: 401 }
      );
    }

    // Parse Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid Authorization header format. Expected: Bearer SK-proxy-...',
        },
        { status: 401 }
      );
    }

    const apiKey = parts[1];

    // Validate key format first (fast check)
    if (!isValidKeyFormat(apiKey)) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid API key format',
        },
        { status: 401 }
      );
    }

    // Validate key against store
    const keyData = validateKey(apiKey);

    if (!keyData) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid or expired API key',
        },
        { status: 401 }
      );
    }

    // Return success with key metadata
    return NextResponse.json(
      {
        valid: true,
        keyId: keyData.id.toString(),
        name: keyData.name,
        expiresAt: keyData.expires_at,
        lastUsedAt: keyData.last_used_at,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('API key validation error:', error);

    return NextResponse.json(
      {
        valid: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/validate
 *
 * Return method not allowed for GET requests
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Method not allowed. Use POST to validate API keys.',
    },
    { status: 405 }
  );
}
