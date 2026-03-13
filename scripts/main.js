import { injectOpenButton, MODULE_ID, ShopGeneratorForm } from "./ui.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "sourcePacks", {
    name: "Source Item Compendiums",
    hint: "Comma-separated compendium pack IDs (example: dnd5e.items, world.magic-items).",
    scope: "world",
    config: true,
    type: String,
    default: "dnd5e.items"
  });

  game.settings.register(MODULE_ID, "includeWorldItems", {
    name: "Include World Items",
    hint: "Include Items from the world item directory in shop generation.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "includeMagicItems", {
    name: "Include Magic Items",
    hint: "Allow magic items in generated stock. Disable for mundane-only shops.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.registerMenu(MODULE_ID, "openGenerator", {
    name: "Open Shop Generator",
    label: "Open",
    hint: "Open the shop generation window.",
    icon: "fas fa-store",
    type: ShopGeneratorForm,
    restricted: true
  });
});

Hooks.on("renderItemDirectory", injectOpenButton);
