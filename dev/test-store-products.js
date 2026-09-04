const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const rows = [
  { sku: "SKU-1", name: "Product 1", platform: "shopee", qty: 2, revenue: 200 },
  { sku: "SKU-1", name: "Product 1", platform: "lazada", qty: 3, revenue: 300 },
  { sku: "SKU-1", name: "Product 1", platform: "tiktok", qty: 1, revenue: 100 },
  { sku: "SKU-2", name: "Product 2", platform: "shopee", qty: 1, revenue: 50 },
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
      assert.equal(merged.length, 2);
      assert.deepEqual(
        { sku: merged[0].sku, qty: merged[0].qty, revenue: merged[0].revenue, platform: merged[0].platform },
        { sku: "SKU-1", qty: 6, revenue: 600, platform: "all" },
      );

      const split = store.products("m:2026-01", metric, "all", grouping, true);
      assert.equal(split.filter((row) => row.sku === "SKU-1").length, 3);
    }
  }

  await store.ensureRangeDetail("m:2026-01", "shopee");
  const shopee = store.products("m:2026-01", "rev", "shopee", "single");
  assert.deepEqual(Array.from(shopee, (row) => row.platform), ["shopee", "shopee"]);
  assert.equal(shopee.reduce((sum, row) => sum + row.revenue, 0), 250);

  console.log("Store product platform aggregation: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
