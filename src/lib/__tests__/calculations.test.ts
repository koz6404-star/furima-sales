import { describe, it, expect } from 'vitest';
import {
  calcFee,
  calcGrossProfit,
  calcPriceWithMargin20,
  calcPriceWithMargin30,
} from '../calculations';

describe('calculations', () => {
  describe('calcFee', () => {
    it('floor: 1000円10% = 100円', () => {
      expect(calcFee(1000, 10, 'floor')).toBe(100);
    });
    it('floor: 999円10% = 99円', () => {
      expect(calcFee(999, 10, 'floor')).toBe(99);
    });
    it('ceil: 1000円10% = 100円', () => {
      expect(calcFee(1000, 10, 'ceil')).toBe(100);
    });
    it('round: 105円10% = 11円', () => {
      expect(calcFee(105, 10, 'round')).toBe(11);
    });
  });

  describe('calcPriceWithMargin20', () => {
    it('1000円原価 -> 1200円', () => {
      expect(calcPriceWithMargin20(1000)).toBe(1200);
    });
    it('999円原価 -> 1199円(ceil)', () => {
      expect(calcPriceWithMargin20(999)).toBe(1199);
    });
  });

  describe('calcPriceWithMargin30', () => {
    it('1000円原価 -> 1300円', () => {
      expect(calcPriceWithMargin30(1000)).toBe(1300);
    });
  });

  describe('calcGrossProfit', () => {
    it('単価1000、1個、手数料100、送料210、資材0、原価500 -> 190', () => {
      expect(
        calcGrossProfit(1000, 1, 100, 210, 0, 500)
      ).toBe(1000 - 100 - 210 - 500);
    });
    it('2個販売の粗利', () => {
      expect(
        calcGrossProfit(1000, 2, 100, 210, 0, 500)
      ).toBe(2000 - 200 - 210 - 1000);
    });
  });
});
