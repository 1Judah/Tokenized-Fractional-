import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAS_TIERS,
  formatPrice,
  calculatePurchaseFees,
  validateSharePurchaseInput,
} from '../utils/feeCalculator.js';

describe('Enhanced Share Purchase Modal & Real-time Calculations (#278)', () => {
  it('correctly calculates base price, platform fees (0.5%), network gas fees, and total cost', () => {
    const fees = calculatePurchaseFees({
      buyAmount: 5,
      pricePerShareStroops: 100_000_000,
      gasTier: 'standard',
    });

    assert.equal(fees.baseCostStroops, 500_000_000);
    assert.equal(fees.platformFeeStroops, 2_500_000);
    assert.equal(fees.networkFeeStroops, 1000);
    assert.equal(fees.totalCostStroops, 502_501_000);
    assert.equal(fees.estimatedTime, '~5 sec');
  });

  it('formats stroop prices correctly to XLM string representation', () => {
    assert.equal(formatPrice(10_000_000), '1.00');
    assert.equal(formatPrice(500_000_000), '50.00');
    assert.equal(formatPrice(0), '0.00');
  });

  it('provides low, standard, and priority gas estimation tiers', () => {
    assert.ok(GAS_TIERS.low);
    assert.ok(GAS_TIERS.standard);
    assert.ok(GAS_TIERS.priority);
    assert.equal(GAS_TIERS.priority.feeStroops, 5000);
  });

  it('validates share quantities and wallet balances correctly', () => {
    const err1 = validateSharePurchaseInput({ buyAmount: 0, availableShares: 10 });
    assert.equal(err1, 'Please enter a valid positive whole number of shares.');

    const err2 = validateSharePurchaseInput({ buyAmount: -2, availableShares: 10 });
    assert.equal(err2, 'Please enter a valid positive whole number of shares.');

    const err3 = validateSharePurchaseInput({ buyAmount: 15, availableShares: 10 });
    assert.equal(err3, 'Quantity exceeds available shares (10).');

    const err4 = validateSharePurchaseInput({
      buyAmount: 2,
      availableShares: 10,
      userWalletBalanceStroops: 10_000_000, // 1 XLM
      totalCostStroops: 50_000_000, // 5 XLM
    });
    assert.ok(err4.includes('exceeds wallet balance'));

    const errValid = validateSharePurchaseInput({
      buyAmount: 2,
      availableShares: 10,
      userWalletBalanceStroops: 100_000_000,
      totalCostStroops: 50_000_000,
    });
    assert.equal(errValid, null);
  });
});
