// Paste or import official data here first. Market and X data should wait until
// these official series / variant masters are stable.
export const officialSchedule = [];

export const officialProducts = [];

export const officialDataExample = {
  id: "bandai-example-2026-10",
  slug: "bandai-example-2026-10",
  name: "公式商品名",
  franchise: "作品名",
  brand: "メーカー名",
  category: "マスコット",
  release_month: "10月",
  release_week: "第2週",
  release_date: "2026-10-09",
  price: 400,
  official_url: "https://example.com/product",
  image_url: "https://example.com/product.jpg",
  released: false,
  variants: [
    {
      id: "bandai-example-character-a",
      slug: "bandai-example-character-a",
      name: "キャラクターA",
      rarity: "通常",
      role: "単品",
      image_url: "https://example.com/character-a.jpg",
      tags: ["単品", "主役"],
      axes: {
        complete: 70,
        ace: 80,
        compatibility: 60,
        limited: 40,
      },
    },
  ],
};
