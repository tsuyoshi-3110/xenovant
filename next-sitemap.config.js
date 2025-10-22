// next-sitemap.config.js
/** @type {import('next-sitemap').IConfig} */
module.exports = {
  // ここを本番で使いたいドメインに変更
  siteUrl: "https://xenovant.shop",

  // robots.txt も要るなら true
  generateRobotsTxt: true,

  // 大規模サイトで分割したい場合
  sitemapSize: 5000,

  // 出力先は public フォルダ
  outDir: "public",

  // 任意で
  changefreq: "daily",
  priority: 0.7,
};
