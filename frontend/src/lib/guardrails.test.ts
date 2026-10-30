import { describe, expect, it } from 'vitest';
import { describeRedactions } from './guardrails';

describe('describeRedactions', () => {
  it('names one kind, singular and plural', () => {
    expect(describeRedactions({ EMAIL: 1 })).toBe('1 email address');
    expect(describeRedactions({ PHONE: 2 })).toBe('2 phone numbers');
  });
  it('joins several kinds', () => {
    expect(describeRedactions({ EMAIL: 1, PHONE: 2 })).toBe('1 email address and 2 phone numbers');
    expect(describeRedactions({ EMAIL: 1, PHONE: 2, CARD: 1 })).toBe('1 email address, 2 phone numbers and 1 card number');
  });
  it('has a generic name for kinds it does not know', () => {
    expect(describeRedactions({ NEW_KIND: 3 })).toBe('3 sensitive items');
  });
  it('is empty when nothing was masked', () => {
    expect(describeRedactions({})).toBe('');
  });
});
