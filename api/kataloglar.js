import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const URL = "https://asistal.com/tr/tum-kataloglar";
    const html = (await axios.get(URL)).data;

    const $ = cheerio.load(html);

    const result = {};

    // Tüm kartları dolaş
    $(".catalog").each((i, card) => {
      const title = $(card).find("h3").text().trim(); 
      if (!title) return;

      // Başlık: “TH78 - THS78 Katalog”
      const code = title.split(" ")[0].toUpperCase();

      result[code] = {
        katalog: null,
        montaj: null,
        test: null,
      };

      // Kartın içindeki tüm PDF linkleri
      $(card)
        .find("a")
        .each((i2, link) => {
          const href = $(link).attr("href");
          if (!href || !href.endsWith(".pdf")) return;

          const fullUrl = "https://asistal.com" + href;

          const type = detectType(fullUrl);

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

// PDF türü bulucu
function detectType(url) {
  const name = url.toLowerCase();

  if (name.includes("montaj")) return "montaj";
  if (name.includes("test")) return "test";

  return "katalog";
}
