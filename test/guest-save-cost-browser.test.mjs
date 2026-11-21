import { test } from 'node:test';
import { normalSaveCost } from './lib/guest-save-transaction.mjs';

test('normal browser saving meets its rate, control and card-copy bounds', { timeout: 120_000 }, normalSaveCost);
