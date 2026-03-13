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

  // Items worth at least 1 gp display in whole GP.
  if (safeCp >= DENOMINATION_TO_CP.gp) {
    const gp = Math.round(safeCp / DENOMINATION_TO_CP.gp);
    return { value: gp, denomination: "gp" };
  }

  // Items worth at least 1 sp display in whole SP.
  if (safeCp >= DENOMINATION_TO_CP.sp) {
    const sp = Math.round(safeCp / DENOMINATION_TO_CP.sp);
    return { value: sp, denomination: "sp" };
  }

  // Copper-only items keep their exact cp value.
  return { value: Math.max(1, safeCp), denomination: "cp" };
}

export function formatPrice(price) {
  return `${price.value} ${price.denomination}`;
}

export function applyPriceModifiers(baseCp, { settlement, quality }) {
  // Copper-only items (< 1 sp) are priced as-is — modifiers aren't meaningful at this scale.
  if (baseCp < DENOMINATION_TO_CP.sp) return baseCp;

  const settlementMod = SETTLEMENT_MODIFIERS[settlement] ?? 1.0;
  const qualityMod = QUALITY_MODIFIERS[quality] ?? 1.0;
  const adjusted = baseCp * settlementMod * qualityMod;

  // Round to nearest whole GP (100cp) above 1 gp; keep sub-GP values intact for SP display.
  if (adjusted >= DENOMINATION_TO_CP.gp) {
    return Math.round(adjusted / 100) * 100;
  }
  // Sub-GP: round to nearest SP (10cp).
  return Math.max(1, Math.round(adjusted / 10) * 10);
}
