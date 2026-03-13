export const DENOMINATION_TO_CP = {
  pp: 1000,
  gp: 100,
  ep: 50,
  sp: 10,
  cp: 1
};

const SETTLEMENT_MODIFIERS = {
  hamlet: 1.2,
  village: 1.1,
  town: 1.0,
  city: 0.9,
  metropolis: 0.85
};

const QUALITY_MODIFIERS = {
  poor: 0.8,
  standard: 1.0,
  luxury: 1.35
};

function normalizePriceFromSystem(priceData) {
  if (priceData == null) return null;

  if (typeof priceData === "number") {
    return {
      value: Math.max(0, priceData),
      denomination: "gp"
    };
  }

  if (typeof priceData === "object") {
    const value = Number(priceData.value ?? 0);
    const denomination = (priceData.denomination ?? "gp").toLowerCase();
    return {
      value: Number.isFinite(value) ? Math.max(0, value) : 0,
      denomination: DENOMINATION_TO_CP[denomination] ? denomination : "gp"
    };
  }

  return null;
}

export function priceToCp(item) {
  const basePrice = normalizePriceFromSystem(item?.system?.price);
  if (!basePrice) return 0;

  const multiplier = DENOMINATION_TO_CP[basePrice.denomination] ?? 100;
  return Math.round(basePrice.value * multiplier);
}

export function cpToPrice(cpValue) {
  const safeCp = Math.max(0, Math.round(cpValue));
  const denominations = ["pp", "gp", "sp", "cp"];

  for (const denomination of denominations) {
    const unit = DENOMINATION_TO_CP[denomination];
    if (safeCp >= unit) {
      const value = Number((safeCp / unit).toFixed(2));
      return { value, denomination };
    }
  }

  return { value: 0, denomination: "cp" };
}

export function formatPrice(price) {
  return `${price.value} ${price.denomination}`;
}

export function applyPriceModifiers(baseCp, { settlement, quality }) {
  const settlementMod = SETTLEMENT_MODIFIERS[settlement] ?? 1.0;
  const qualityMod = QUALITY_MODIFIERS[quality] ?? 1.0;
  const adjusted = baseCp * settlementMod * qualityMod;

  // Round to nearest 5cp so prices are table-friendly.
  return Math.max(1, Math.round(adjusted / 5) * 5);
}
