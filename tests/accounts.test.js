// tests/accounts.test.js
// Integration tests for account import/export system

import test from 'node:test';
import assert from 'node:assert';
import { accountStore } from '../src/lib/accounts/store.js';
import { importAccounts, parse9Router, parseOMNIROUTER, parseLLN } from '../src/lib/accounts/import.js';
import { exportToJSON, exportTo9Router, exportToOMNIROUTER } from '../src/lib/accounts/export.js';
import { validateAccount, normalizeAccount } from '../src/lib/accounts/schema.js';

// Test data fixtures
const test9RouterData = {
  accounts: [
    { email: 'user1@example.com', password: 'pass123', tier: 'pro' },
    { email: 'user2@example.com', password: 'pass456', tier: 'free' },
  ],
};

const testOMNIROUTERData = {
  connections: [
    { username: 'user3@example.com', password: 'pass789', tier: 'enterprise' },
    { username: 'user4@example.com', password: 'pass000' },
  ],
};

const testLLNData = [
  { email: 'user5@example.com', password: 'pass111' },
  { email: 'user6@example.com', password: 'pass222' },
];

test.describe('Account Schema Validation', () => {
  test('should validate a valid account', () => {
    const result = validateAccount({
      email: 'test@example.com',
      password: 'password123',
      tier: 'free',
      provider: 'manual',
    });
    assert.strictEqual(result.valid, true);
  });

  test('should reject account without email', () => {
    const result = validateAccount({
      password: 'password123',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Email') || e.includes('email')));
  });

  test('should reject account without password', () => {
    const result = validateAccount({
      email: 'test@example.com',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Password') || e.includes('password')));
  });

  test('should reject invalid email format', () => {
    const result = validateAccount({
      email: 'invalid-email',
      password: 'pass123',
    });
    assert.strictEqual(result.valid, false);
  });

  test('should normalize username to email', () => {
    const result = normalizeAccount(
      { username: 'user@example.com', password: 'pass' },
      'manual'
    );
    assert.strictEqual(result.email, 'user@example.com');
    assert.strictEqual(result.provider, 'manual');
  });
});

test.describe('Account Import - Format Parsing', () => {
  test('should parse 9router format', () => {
    const accounts = parse9Router(test9RouterData);
    assert.strictEqual(accounts.length, 2);
    assert.strictEqual(accounts[0].provider, '9router');
    assert.strictEqual(accounts[0].tier, 'pro');
    assert.strictEqual(accounts[0].email, 'user1@example.com');
  });

  test('should parse OMNIROUTER format', () => {
    const accounts = parseOMNIROUTER(testOMNIROUTERData);
    assert.strictEqual(accounts.length, 2);
    assert.strictEqual(accounts[0].provider, 'OMNIROUTER');
    assert.strictEqual(accounts[0].email, 'user3@example.com');
    assert.strictEqual(accounts[0].tier, 'enterprise');
  });

  test('should parse lln format', () => {
    const accounts = parseLLN(testLLNData);
    assert.strictEqual(accounts.length, 2);
    assert.strictEqual(accounts[0].provider, 'lln');
    assert.strictEqual(accounts[0].tier, 'free');
  });

  test('should auto-detect 9router format', () => {
    const result = importAccounts(test9RouterData, 'auto');
    assert.strictEqual(result.format, '9router');
    assert.strictEqual(result.success, 2);
    assert.strictEqual(result.failed, 0);
  });

  test('should auto-detect OMNIROUTER format', () => {
    const result = importAccounts(testOMNIROUTERData, 'auto');
    assert.strictEqual(result.format, 'OMNIROUTER');
    assert.strictEqual(result.success, 2);
  });

  test('should auto-detect lln format', () => {
    const result = importAccounts(testLLNData, 'auto');
    assert.strictEqual(result.format, 'lln');
    assert.strictEqual(result.success, 2);
  });

  test('should handle empty data', () => {
    const result = importAccounts({ accounts: [] }, 'auto');
    assert.strictEqual(result.success, 0);
  });
});

test.describe('Account Store Operations', () => {
  test.beforeEach(() => {
    accountStore.clear();
  });

  test('should clear database', () => {
    const result = accountStore.clear();
    assert.strictEqual(result.success, true);
    const accounts = accountStore.list();
    assert.strictEqual(accounts.length, 0);
  });

  test('should add account to store', () => {
    const result = accountStore.add({
      email: 'store-test@example.com',
      password: 'testpass',
      tier: 'pro',
      provider: 'manual',
    });
    assert.strictEqual(result.success, true);
    assert.ok(result.account);
    assert.ok(result.account.id);
  });

  test('should get account by email', () => {
    accountStore.add({
      email: 'find-test@example.com',
      password: 'pass',
      tier: 'free',
      provider: 'manual',
    });

    const account = accountStore.getByEmail('find-test@example.com');
    assert.ok(account);
    assert.strictEqual(account.email, 'find-test@example.com');
  });

  test('should get account by id', () => {
    const result = accountStore.add({
      email: 'id-test@example.com',
      password: 'pass',
      tier: 'free',
      provider: 'manual',
    });

    const account = accountStore.get(result.account.id);
    assert.ok(account);
    assert.strictEqual(account.email, 'id-test@example.com');
  });

  test('should list all accounts', () => {
    accountStore.add({ email: 'a@example.com', password: 'p1', tier: 'free', provider: 'manual' });
    accountStore.add({ email: 'b@example.com', password: 'p2', tier: 'pro', provider: 'manual' });

    const accounts = accountStore.list();
    assert.strictEqual(accounts.length, 2);
  });

  test('should update account', () => {
    const result = accountStore.add({
      email: 'update-test@example.com',
      password: 'pass',
      tier: 'free',
      provider: 'manual',
    });

    const updateResult = accountStore.update(result.account.id, { tier: 'enterprise' });
    assert.strictEqual(updateResult.success, true);

    const updated = accountStore.get(result.account.id);
    assert.strictEqual(updated.tier, 'enterprise');
  });

  test('should delete account', () => {
    const result = accountStore.add({
      email: 'delete-test@example.com',
      password: 'pass',
      tier: 'free',
      provider: 'manual',
    });

    const deleteResult = accountStore.delete(result.account.id);
    assert.strictEqual(deleteResult.success, true);

    const deleted = accountStore.get(result.account.id);
    assert.strictEqual(deleted, null);
  });

  test('should bulk import accounts', () => {
    const accounts = parse9Router(test9RouterData);
    const result = accountStore.bulkImport(accounts, '9router');
    assert.strictEqual(result.success, 2);
    assert.strictEqual(result.failed, 0);

    const stored = accountStore.list();
    assert.strictEqual(stored.length, 2);
  });

  test('should count accounts by tier', () => {
    accountStore.add({ email: 'free1@example.com', password: 'p', tier: 'free', provider: 'manual' });
    accountStore.add({ email: 'free2@example.com', password: 'p', tier: 'free', provider: 'manual' });
    accountStore.add({ email: 'pro1@example.com', password: 'p', tier: 'pro', provider: 'manual' });

    const counts = accountStore.countByTier();
    assert.strictEqual(counts.total, 3);
    assert.strictEqual(counts.free, 2);
    assert.strictEqual(counts.pro, 1);
  });

  test('should prevent duplicate emails', () => {
    accountStore.add({ email: 'dup@example.com', password: 'p1', tier: 'free', provider: 'manual' });
    const result = accountStore.add({ email: 'dup@example.com', password: 'p2', tier: 'pro', provider: 'manual' });

    assert.strictEqual(result.success, false);
  });
});

test.describe('Account Export', () => {
  test.beforeEach(() => {
    accountStore.clear();
    accountStore.bulkImport(parse9Router(test9RouterData), '9router');
  });

  test('should export to JSON format', () => {
    const exported = exportToJSON();
    assert.ok(exported.accounts);
    assert.ok(Array.isArray(exported.accounts));
    assert.ok(exported.exportedAt);
    assert.strictEqual(exported.format, 'kiro-proxy');
    assert.ok(exported.accounts.length >= 2);
  });

  test('should export to 9router format', () => {
    const exported = exportTo9Router();
    assert.ok(exported.accounts);
    assert.ok(Array.isArray(exported.accounts));
    assert.ok(exported.accounts.length >= 2);
    assert.ok(exported.accounts[0].email);
    assert.ok(exported.accounts[0].password);
  });

  test('should export to OMNIROUTER format', () => {
    const exported = exportToOMNIROUTER();
    assert.ok(exported.connections);
    assert.ok(Array.isArray(exported.connections));
    assert.ok(exported.connections.length >= 2);
    assert.ok(exported.connections[0].username);
  });
});
