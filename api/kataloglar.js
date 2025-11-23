import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const URL = "https://asistal.com/tr/tum-kataloglar";
    const html = (await axios.get(URL)).data;
    const $ = cheerio.load(html);

    const result = {};

    $(".viewer-box").each((i, box) => {
      // başlık → "TM55 Katalog"
      const rawTitle = $(box).find(".title").text().trim();

      if (!rawTitle) return;

      // sistem kodu → TM55
      const code = rawTitle.split(" ")[0].toUpperCase();

      if (!result[code]) {
        result[code] = {
          katalog: null,
          montaj: null,
          test: null
        };
      }

      // Kart içindeki tüm PDF linkleri
      $(box)
        .find("a[href$='.pdf']")
        .each((i2, link) => {
          const href = $(link).attr("href");
          if (!href) return;

          const fullUrl = "https://asistal.com" + href;
          const type = detectPdfType(fullUrl);

          if (type === "katalog" && !result[code].katalog)
            result[code].katalog = fullUrl;

          if (type === "montaj" && !result[code].montaj)
            result[code].montaj = fullUrl;

          if (type === "test" && !result[code].test)
            result[code].test = fullUrl;
        });
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}

// PDF türü tespit
function detectPdfType(url) {
  const name = url.toLowerCase();

  if (name.includes("montaj")) return "montaj";
  if (name.includes("test")) return "test";

  return "katalog";
}
