import { applyPriceModifiers, cpToPrice, formatPrice, priceToCp } from "./pricing.js";

const SHOP_ITEM_TYPES = {
  general:      ["equipment", "consumable", "tool", "loot", "backpack"],
  blacksmith:   ["weapon", "equipment", "tool"],
  alchemy:      ["consumable", "tool", "loot"],
  arcane:       ["consumable", "tool", "equipment", "loot"],
  fletcher:     ["weapon", "consumable", "tool", "equipment"],
  jeweler:      ["loot", "equipment", "tool"],
  herbalist:    ["consumable", "tool"],
  tavern:       ["consumable", "loot", "tool"],
  stables:      ["equipment", "consumable", "tool"],
  leatherworker:["equipment", "tool", "weapon"],
  tailor:       ["equipment", "tool", "loot"],
  bookshop:     ["consumable", "tool", "loot"],
  temple:       ["consumable", "equipment", "tool", "loot"],
  curiosity:    ["loot", "consumable", "equipment", "tool", "backpack", "weapon"]
};

// Per-shop keyword lists derived from the D&D Shop Catalog PDF.
// An item passes if its lowercased name includes ANY keyword.
// An empty array means no keyword restriction — type filter only.
const SHOP_ITEM_KEYWORDS = {
  blacksmith:    ["leather", "chain shirt", "scale mail", "breastplate", "half plate",
                  "ring mail", "chain mail", "splint", "plate", "battleaxe", "flail",
                  "glaive", "greataxe", "greatsword", "halberd", "lance", "longsword",
                  "maul", "morningstar", "pike", "rapier", "scimitar", "shortsword",
                  "trident", "war pick", "warhammer", "smith", "mason", "carpenter",
                  "tinker"],
  fletcher:      ["crossbow", "shortbow", "longbow", "arrow", "bolt", "bowstring",
                  "quiver", "dagger", "handaxe", "javelin", "light hammer", "mace",
                  "sickle", "spear", "ball bearings", "crowbar", "grappling hook",
                  "hunting trap", "shield", "horn", "lantern", "lamp", "lock",
                  "manacles", "mirror", "piton", "whetstone", "chain", "bell"],
  alchemy:       ["potion", "elixir", "oil", "philter", "antitoxin", "herbalism",
                  "alchemist", "vial", "perfume", "acid"],
  arcane:        ["spell scroll", "spellbook", "component pouch", "arcane focus",
                  "crystal", "orb", "rod", "staff", "wand", "robe", "candle",
                  "ink", "parchment", "paper", "mistletoe", "totem", "hourglass",
                  "pouch", "vial", "bottle", "abacus", "case"],
  general:       ["rope", "torch", "lantern", "lamp", "candle", "blanket", "backpack",
                  "rations", "waterskin", "clothes", "pouch", "sack", "chest", "lock",
                  "mirror", "shovel", "hammer", "crowbar", "mess kit", "bucket",
                  "barrel", "ladder", "soap", "vial", "flask", "bottle", "pot",
                  "ink", "paper", "parchment", "journal", "scale", "abacus",
                  "signet ring", "bell", "piton", "whetstone", "tinderbox"],
  jeweler:       ["gem", "jewel", "ring", "amulet", "necklace", "earring", "bracelet",
                  "signet", "crystal", "orb", "jeweler"],
  herbalist:     ["herbalism", "potion of healing", "antitoxin", "healer's kit",
                  "candle", "vial", "perfume", "incense", "rations"],
  tavern:        ["rations", "flask", "jug", "pitcher", "candle", "torch", "lamp",
                  "blanket", "mess kit", "waterskin", "vial", "playing card", "dice"],
  stables:       ["saddle", "bit", "bridle", "saddlebag", "feed", "blanket", "rope",
                  "hammer", "bucket", "cart", "wagon", "lantern", "lamp"],
  leatherworker: ["leather", "hide", "shield", "boots", "gloves", "cloak", "belt",
                  "pouch", "backpack", "waterskin", "sling", "whip", "cobbler",
                  "bandolier", "quiver"],
  tailor:        ["clothes", "cloak", "robe", "costume", "traveler", "blanket",
                  "tent", "sack", "pouch", "weaver", "disguise kit", "basket",
                  "needle", "thread"],
  bookshop:      ["book", "tome", "scroll", "ink", "paper", "parchment", "journal",
                  "calligrapher", "herbalism kit", "flute", "lyre", "horn", "lute",
                  "viol", "pan flute", "dulcimer", "drum", "shawm", "bagpipe"],
  temple:        ["holy symbol", "holy water", "candle", "incense", "healer's kit",
                  "rations", "blanket", "torch", "oil", "lamp", "lantern", "vial",
                  "perfume", "potion of healing", "waterskin", "parchment", "paper",
                  "censer", "alms", "bell", "reliquary", "amulet"],
  curiosity:     [] // no keyword filter — widest possible pool
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

function hasMagicProperty(item) {
  const props = item?.system?.properties;
  if (!props) return false;
  if (Array.isArray(props)) return props.includes("mgc");
  if (props instanceof Set) return props.has("mgc");
  if (typeof props === "object") return Boolean(props.mgc);
  return false;
}

function isMagicItem(item) {
  const rarity = normalizeRarity(item);
  const magicRarities = ["uncommon", "rare", "very rare", "legendary", "artifact"];
  return hasMagicProperty(item) || magicRarities.includes(rarity);
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

function rollStockQuantity(item) {
  const rarity = normalizeRarity(item);
  const type = item.type;

  const baseByType = {
    consumable: [6, 20],
    loot: [2, 10],
    equipment: [1, 8],
    tool: [1, 6],
    backpack: [1, 5],
    weapon: [1, 4]
  };

  const [minBase, maxBase] = baseByType[type] ?? [1, 6];
  const raw = Math.floor(Math.random() * (maxBase - minBase + 1)) + minBase;

  const rarityMultiplier = {
    common: 1.0,
    uncommon: 0.65,
    rare: 0.4,
    "very rare": 0.25,
    legendary: 0.1,
    artifact: 0.1
  };

  const scaled = Math.round(raw * (rarityMultiplier[rarity] ?? 1.0));
  return Math.max(1, scaled);
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

function matchesShopKeywords(item, shopType) {
  const keywords = SHOP_ITEM_KEYWORDS[shopType];
  if (!keywords || keywords.length === 0) return true; // no restriction
  const name = item.name.toLowerCase();
  return keywords.some((kw) => name.includes(kw));
}

function itemUniqueKey(item) {
  const normalizedName = String(item.name ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${item.type}:${normalizedName}`;
}

export async function getItemPool({ shopType, sourcePackIds, includeWorldItems, includeMagicItems }) {
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
    if (!matchesShopKeywords(item, shopType)) continue;
    if (!includeMagicItems && isMagicItem(item)) continue;
    if (item.system?.quantity === 0) continue;

    const key = itemUniqueKey(item);
    if (!deduped.has(key)) deduped.set(key, item);
  }

  return Array.from(deduped.values());
}

export function buildShopName(shopType, quality) {
  const prefixes = ["Iron", "Silver", "Cinder", "Gilded", "Wayfarer", "Moon", "Oak", "Copper"];
  const suffixByType = {
    general:       ["Bazaar", "Outfitter", "Supply", "Emporium"],
    blacksmith:    ["Forge", "Anvil", "Hammerworks", "Smithy"],
    alchemy:       ["Elixirs", "Still", "Phials", "Retort"],
    arcane:        ["Sigils", "Curios", "Arcana", "Esoterica"],
    fletcher:      ["Quivers", "Bowyer", "Arrowsmith", "Stave"],
    jeweler:       ["Gems", "Jewels", "Facets", "Brilliance"],
    herbalist:     ["Roots", "Garden", "Herbary", "Canopy"],
    tavern:        ["Flagon", "Hearth", "Table", "Cellar"],
    stables:       ["Stables", "Paddock", "Tack", "Farrier"],
    leatherworker: ["Hides", "Tannery", "Stitchworks", "Leathers"],
    tailor:        ["Clothier", "Needle", "Stitches", "Textiles"],
    bookshop:      ["Scrolls", "Volumes", "Pages", "Codex"],
    temple:        ["Shrine", "Vestry", "Chapel", "Sanctum"],
    curiosity:     ["Oddities", "Relics", "Trinkets", "Wonders"]
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
  const autoTarget = Math.max(5, Math.floor(baseStock * (QUALITY_STOCK_MULTIPLIER[config.quality] ?? 1.0)));
  const stockTarget = config.itemCount ?? autoTarget;

  const pool = await getItemPool(config);
  if (!pool.length) {
    throw new Error("No valid item candidates found. Check your source compendiums and filters.");
  }

  const weightedPool = pool.map((item) => ({
    item,
    weight: baseWeight(item, config.quality)
  }));

  const chosen = [];
  const usedKeys = new Set();

  while (chosen.length < stockTarget && usedKeys.size < weightedPool.length) {
    const pick = weightedPick(weightedPool);
    const key = itemUniqueKey(pick.item);
    if (usedKeys.has(key)) continue;

    usedKeys.add(key);

    const baseCp = priceToCp(pick.item);
    const finalCp = applyPriceModifiers(baseCp || 100, config);
    const finalPrice = cpToPrice(finalCp);

    chosen.push({
      id: pick.item.id,
      uuid: pick.item.uuid,
      name: pick.item.name,
      type: pick.item.type,
      stock: rollStockQuantity(pick.item),
      rarity: normalizeRarity(pick.item),
      baseCp,
      finalCp,
      finalPrice,
      displayPrice: formatPrice(finalPrice)
    });
  }

  const sorted = chosen.sort((a, b) => a.finalCp - b.finalCp);

  return {
    name: config.shopName || buildShopName(config.shopType, config.quality),
    shopType: config.shopType,
    settlement: config.settlement,
    quality: config.quality,
    inventory: sorted,
    generatedAt: new Date().toISOString()
  };
}
