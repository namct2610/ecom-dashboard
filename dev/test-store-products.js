const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const rows = [
  { sku: "SKU-1", name: "Váng sữa Product 1", platform: "shopee", qty: 2, revenue: 200 },
  { sku: "SKU-1", name: "Váng sữa Product 1", platform: "lazada", qty: 3, revenue: 300 },
  { sku: "SKU-1", name: "Váng sữa Product 1", platform: "tiktok", qty: 1, revenue: 100 },
  { sku: "SKU-2", name: "Sữa chua Product 2", platform: "shopee", qty: 1, revenue: 50 },
  { sku: "GIFT-1", name: "Gift item", platform: "shopee", qty: 50, revenue: 0 },
];

const window = {
  DASH: {
    monthly: [{ ym: "2026-01" }],
    daily: [{ date: "2026-01-01" }],
    monthDetail: {},
    latestMonth: "2026-01",
    focusMonths: ["2026-01"],
  },
  location: { href: "https://example.test/index.php" },
  I18n: { getLang: () => "vi" },
  t: (_key, fallback) => fallback,
};

const context = {
  window,
  URL,
  localStorage: { getItem: () => null, setItem: () => {} },
  fetch: async (url) => {
    const platform = new URL(url).searchParams.get("platform");
    const filtered = platform ? rows.filter((row) => row.platform === platform) : rows;
    return {
      ok: true,
      json: async () => ({
        topRev: filtered,
        topQty: filtered,
        topRevCombo: filtered,
        topQtyCombo: filtered,
      }),
    };
  },
};

vm.runInNewContext(fs.readFileSync("assets/store.js", "utf8"), context);

(async () => {
  const store = window.Store;
  await store.ensureRangeDetail("m:2026-01", "all");

  for (const grouping of ["single", "combo"]) {
    for (const metric of ["rev", "qty"]) {
      const merged = store.products("m:2026-01", metric, "all", grouping);
      assert.equal(merged.length, 3);
      const sku1 = merged.find((row) => row.sku === "SKU-1");
      assert.deepEqual(
        { sku: sku1.sku, qty: sku1.qty, revenue: sku1.revenue, platform: sku1.platform },
        { sku: "SKU-1", qty: 6, revenue: 600, platform: "all" },
      );

      const split = store.products("m:2026-01", metric, "all", grouping, true);
      assert.equal(split.filter((row) => row.sku === "SKU-1").length, 3);
    }
  }

  await store.ensureRangeDetail("m:2026-01", "shopee");
  const shopee = store.products("m:2026-01", "rev", "shopee", "single");
  assert.deepEqual(Array.from(shopee, (row) => row.platform), ["shopee", "shopee", "shopee"]);
  assert.equal(shopee.reduce((sum, row) => sum + row.revenue, 0), 250);

  window.Views = {};
  window.UI = {
    esc: (value) => String(value),
    pchip: (platform) => `platform:${platform}`,
    cssColor: (color) => color,
  };
  window.Charts = {};
  window.App = { rerender: () => {} };
  window.t = (key, fallback) => fallback || key;
  vm.runInNewContext(fs.readFileSync("assets/views-pages.js", "utf8"), context);

  const handlers = {};
  window.Views.products.mount({
    querySelector: (selector) => selector === "#prodGroupingSeg" || selector === "#prodSeg"
      ? { addEventListener: (_event, handler) => { handlers[selector] = handler; } }
      : null,
  });
  handlers["#prodSeg"]({ target: { closest: () => ({ dataset: { m: "qty" } }) } });

  const singleHtml = window.Views.products.render();
  assert.equal(singleHtml.includes("th.platform"), false);
  assert.equal(singleHtml.includes("Gift item"), false);
  const shares = Array.from(singleHtml.matchAll(/cat-share[^>]*>([\d,.]+)%/g), (match) => Number(match[1].replace(",", ".")));
  assert.equal(shares.length, 2);
  assert.ok(Math.abs(shares.reduce((sum, share) => sum + share, 0) - 100) < 0.01);

  handlers["#prodGroupingSeg"]({ target: { closest: () => ({ dataset: { grouping: "combo" } }) } });
  const comboHtml = window.Views.products.render();
  assert.equal(comboHtml.includes("th.platform"), true);
  assert.equal(comboHtml.includes("Gift item"), false);

  console.log("Store aggregation and product report filtering: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
