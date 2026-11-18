import { test } from 'node:test';
import { pausedSave } from './lib/guest-save-transaction.mjs';

test('a real browser save completes after the guest is paused with pending data', { timeout: 120_000 }, pausedSave);
