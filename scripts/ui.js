import { generateShop } from "./generator.js";

export const MODULE_ID = "dnd-shop-generator";

function csvToPackIds(csv) {
  return String(csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function inventoryToHtmlRows(inventory) {
  return inventory
    .map(
      (item) => `<tr>
        <td>${item.name}</td>
        <td>${item.type}</td>
        <td>${item.rarity}</td>
        <td>${item.displayPrice}</td>
      </tr>`
    )
    .join("\n");
}

async function createJournalFromShop(shopData) {
  const rows = inventoryToHtmlRows(shopData.inventory);
  const content = `
    <h2>${shopData.name}</h2>
    <p><strong>Type:</strong> ${shopData.shopType} | <strong>Settlement:</strong> ${shopData.settlement} | <strong>Quality:</strong> ${shopData.quality}</p>
    <table>
      <thead>
        <tr><th>Item</th><th>Type</th><th>Rarity</th><th>Price</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return JournalEntry.create({
    name: `${shopData.name} (Shop)`,
    pages: [
      {
        name: "Inventory",
        type: "text",
        text: { content, format: 1 }
      }
    ]
  });
}

export class ShopGeneratorForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-generator`,
      classes: [MODULE_ID],
      title: "D&D Shop Generator",
      template: `modules/${MODULE_ID}/templates/shop-generator.hbs`,
      width: 460,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: false
    });
  }

  getData() {
    return {
      settlementOptions: ["hamlet", "village", "town", "city", "metropolis"],
      qualityOptions: ["poor", "standard", "luxury"],
      typeOptions: ["general", "blacksmith", "alchemy", "arcane"],
      sourcePacks: game.settings.get(MODULE_ID, "sourcePacks"),
      includeWorldItems: game.settings.get(MODULE_ID, "includeWorldItems"),
      includeMagicItems: game.settings.get(MODULE_ID, "includeMagicItems")
    };
  }

  async _updateObject(_event, formData) {
    const sourcePacks = String(formData.sourcePacks ?? "");
    const includeWorldItems = Boolean(formData.includeWorldItems);
    const includeMagicItems = Boolean(formData.includeMagicItems);

    await game.settings.set(MODULE_ID, "sourcePacks", sourcePacks);
    await game.settings.set(MODULE_ID, "includeWorldItems", includeWorldItems);
    await game.settings.set(MODULE_ID, "includeMagicItems", includeMagicItems);

    const config = {
      shopType: formData.shopType,
      settlement: formData.settlement,
      quality: formData.quality,
      sourcePackIds: csvToPackIds(sourcePacks),
      includeWorldItems,
      includeMagicItems
    };

    if (!config.sourcePackIds.length && !config.includeWorldItems) {
      ui.notifications.warn("Choose at least one source compendium or enable world items.");
      return;
    }

    try {
      const shopData = await generateShop(config);
      new ShopResultApp(shopData).render(true);
    } catch (err) {
      console.error(`${MODULE_ID} | Generation failed`, err);
      ui.notifications.error(`Shop generation failed: ${err.message}`);
    }
  }
}

export class ShopResultApp extends Application {
  constructor(shopData, options = {}) {
    super(options);
    this.shopData = shopData;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-result`,
      classes: [MODULE_ID],
      title: "Generated Shop",
      template: `modules/${MODULE_ID}/templates/shop-result.hbs`,
      width: 680,
      height: 640,
      resizable: true
    });
  }

  getData() {
    return this.shopData;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='save-journal']").on("click", async () => {
      const doc = await createJournalFromShop(this.shopData);
      ui.notifications.info(`Created Journal Entry: ${doc.name}`);
    });
  }
}

export function injectOpenButton(_app, html) {
  if (!game.user.isGM) return;

  const actions = html.find(".header-actions");
  if (!actions.length) return;

  const already = html.find(`[data-action='${MODULE_ID}-open']`);
  if (already.length) return;

  const button = $(`<button type='button' class='${MODULE_ID}-open' data-action='${MODULE_ID}-open'>
    <i class='fas fa-store'></i> Shop Generator
  </button>`);

  button.on("click", () => new ShopGeneratorForm().render(true));
  actions.append(button);
}
