import { applyPriceModifiers, cpToPrice, formatPrice, priceToCp } from "./pricing.js";

const SHOP_ITEM_TYPES = {
  general: ["equipment", "consumable", "tool", "loot", "backpack"],
  blacksmith: ["weapon", "equipment", "tool"],
  alchemy: ["consumable", "tool", "loot"],
  arcane: ["consumable", "tool", "equipment", "loot"]
};

const STOCK_SIZES = {
  hamlet: 8,
  village: 12,
  town: 18,
  city: 24,
  metropolis: 32
};

const QUALITY_STOCK_MULTIPLIER = {
  poor: 0.7,
  standard: 1.0,
  luxury: 1.4
};

const RARITY_WEIGHT = {
  common: 10,
  uncommon: 5,
  rare: 2,
  "very rare": 0.75,
  legendary: 0.2,
  artifact: 0.1
};

function normalizeRarity(item) {
  return String(item?.system?.rarity ?? "common").toLowerCase();
}

function baseWeight(item, quality) {
  const rarity = normalizeRarity(item);
  const rarityWeight = RARITY_WEIGHT[rarity] ?? 8;

  // Better shops are more likely to surface uncommon and rare inventory.
  if (quality === "luxury" && ["uncommon", "rare", "very rare"].includes(rarity)) {
    return rarityWeight * 1.5;
  }

  if (quality === "poor" && ["rare", "very rare", "legendary", "artifact"].includes(rarity)) {
    return rarityWeight * 0.35;
  }

  return rarityWeight;
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const entry of items) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }

  return items[items.length - 1];
}

async function loadItemsFromPack(packId) {
  const pack = game.packs.get(packId);
  if (!pack || pack.documentName !== "Item") return [];

  const docs = await pack.getDocuments();
  return docs.filter((item) => !item.system?.source?.custom);
}

export async function getItemPool({ shopType, sourcePackIds, includeWorldItems }) {
  const validTypes = SHOP_ITEM_TYPES[shopType] ?? SHOP_ITEM_TYPES.general;
  const pool = [];

  for (const packId of sourcePackIds) {
    const items = await loadItemsFromPack(packId.trim());
    pool.push(...items);
  }

  if (includeWorldItems) {
    pool.push(...game.items.contents);
  }

  const deduped = new Map();
  for (const item of pool) {
    if (!validTypes.includes(item.type)) continue;
    if (item.system?.quantity === 0) continue;
    if (!deduped.has(item.uuid)) deduped.set(item.uuid, item);
  }

  return Array.from(deduped.values());
}

export function buildShopName(shopType, quality) {
  const prefixes = ["Iron", "Silver", "Cinder", "Gilded", "Wayfarer", "Moon", "Oak", "Copper"];
  const suffixByType = {
    general: ["Bazaar", "Outfitter", "Supply", "Emporium"],
    blacksmith: ["Forge", "Anvil", "Hammerworks", "Smithy"],
    alchemy: ["Elixirs", "Still", "Phials", "Retort"],
    arcane: ["Sigils", "Curios", "Arcana", "Esoterica"]
  };

  const qualityFlavor = {
    poor: "Humble",
    standard: "",
    luxury: "Grand"
  };

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffixes = suffixByType[shopType] ?? suffixByType.general;
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const flavor = qualityFlavor[quality] ?? "";

  return `${flavor} ${prefix} ${suffix}`.replace(/\s+/g, " ").trim();
}

export async function generateShop(config) {
  const baseStock = STOCK_SIZES[config.settlement] ?? 12;
  const stockTarget = Math.max(5, Math.floor(baseStock * (QUALITY_STOCK_MULTIPLIER[config.quality] ?? 1.0)));

  const pool = await getItemPool(config);
  if (!pool.length) {
    throw new Error("No valid item candidates found. Check your source compendiums and filters.");
  }

  const weightedPool = pool.map((item) => ({
    item,
    weight: baseWeight(item, config.quality)
  }));

  const chosen = [];
  const usedUuids = new Set();

  while (chosen.length < stockTarget && usedUuids.size < weightedPool.length) {
    const pick = weightedPick(weightedPool);
    if (usedUuids.has(pick.item.uuid)) continue;

    usedUuids.add(pick.item.uuid);

    const baseCp = priceToCp(pick.item);
    const finalCp = applyPriceModifiers(baseCp || 100, config);
    const finalPrice = cpToPrice(finalCp);

    chosen.push({
      id: pick.item.id,
      uuid: pick.item.uuid,
      name: pick.item.name,
      type: pick.item.type,
      rarity: normalizeRarity(pick.item),
      baseCp,
      finalCp,
      finalPrice,
      displayPrice: formatPrice(finalPrice)
    });
  }

  const sorted = chosen.sort((a, b) => a.finalCp - b.finalCp);

  return {
    name: buildShopName(config.shopType, config.quality),
    shopType: config.shopType,
    settlement: config.settlement,
    quality: config.quality,
    inventory: sorted,
    generatedAt: new Date().toISOString()
  };
}
