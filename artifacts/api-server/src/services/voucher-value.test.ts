import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidVoucherOverride, parseVoucherValue, resolveVoucherValue } from "./voucher-value";

test("accepts a positive decimal voucher value", () => {
  assert.equal(parseVoucherValue("20.00"), 20);
  assert.equal(parseVoucherValue("8.5"), 8.5);
  assert.equal(parseVoucherValue("0"), null);
  assert.equal(parseVoucherValue("20.001"), null);
});

test("rejects formatted and non-finite values", () => {
  assert.equal(parseVoucherValue("R$ 8,50/dia"), null);
  assert.equal(parseVoucherValue("NaN"), null);
  assert.equal(parseVoucherValue("Infinity"), null);
  assert.equal(parseVoucherValue(""), null);
});

test("allows an absent override but rejects malformed input", () => {
  assert.equal(isValidVoucherOverride(null), true);
  assert.equal(isValidVoucherOverride(""), true);
  assert.equal(isValidVoucherOverride("20.00"), true);
  assert.equal(isValidVoucherOverride("R$ 8,50/dia"), false);
  assert.equal(isValidVoucherOverride(20), false);
  assert.equal(isValidVoucherOverride({}), false);
});

test("uses valid employee override or falls back to the company value", () => {
  assert.equal(resolveVoucherValue("15.00", "20.00"), 15);
  assert.equal(resolveVoucherValue(null, "20.00"), 20);
  assert.equal(resolveVoucherValue("R$ 8,50/dia", "20.00"), 20);
  assert.throws(() => resolveVoucherValue(null, "NaN"), /empresa inválido/);
});
