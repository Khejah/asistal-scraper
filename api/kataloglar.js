import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  try {
    const url = "https://asistal.com/tr/tum-kataloglar";

    // ID MAP JSON GITHUB ROOT
    const idMapUrl = "https://raw.githubusercontent.com/Khejah/asistal-scraper/main/id_map.json";
    const idMap = await fetch(idMapUrl).then(r => r.json());

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector(".viewer-box");

    const rawData = await page.evaluate(() => {
      const result = {};
      const items = document.querySelectorAll(".viewer-box");

      items.forEach((box) => {
        const isLink = box.tagName.toLowerCase() === "a";

        const titleEl = box.querySelector(".title");
        if (!titleEl) return;

        let rawTitle = titleEl.innerText.trim();

        // Unicode tireleri normalize et
        rawTitle = rawTitle.replace(/[\u2010-\u2015]/g, "-");

        // Harf-rakam-tire-boşluk dışındaki karakterleri temizle
        rawTitle = rawTitle.replace(/[^\w\- ]+/g, "");

        // İlk 3 kelimeyi alıp birleştir → çoğu katalog için yeterli
        const code = rawTitle
          .split(/\s+/)
          .slice(0, 3)
          .join("")
          .toUpperCase();

        if (!result[code]) {
          result[code] = { katalog: null, montaj: null, test: null, kesim: null };
        }

        function assignType(obj, url) {
          const name = url.toLowerCase();
          if (name.includes("-m-v1.pdf")) { obj.kesim = url; return; }
          if (name.includes("montaj") || name.match(/-\dm-|-[a-z]m-|[-_]m[-_]/)) { obj.montaj = url; return; }
          if (name.includes("test")) { obj.test = url; return; }
          obj.katalog = url;
        }

        if (isLink) {
          assignType(result[code], "https://asistal.com" + box.getAttribute("href"));
        } else {
          box.querySelectorAll("a[href$='.pdf']").forEach(a => {
            assignType(result[code], "https://asistal.com" + a.getAttribute("href"));
          });
        }
      });

      return result;
    });

    await browser.close();

    const finalData = {};

    for (const code of Object.keys(rawData)) {
      if (!idMap[code]) continue;

      const id = idMap[code];
      finalData[id] = {
        id,
        title: code,
        katalog: rawData[code].katalog,
        montaj: rawData[code].montaj,
        test: rawData[code].test,
        kesim: rawData[code].kesim
      };
    }

    if (finalData["katalog058"]) {
      finalData["katalog058"].katalog =
        "https://www.asistal.com/storage/products/media/1977/p55-2024-v1.pdf";
      finalData["katalog058"].kesim =
        "https://www.asistal.com/storage/products/media/1984/p55-2024-m-v1.pdf";
    }
// --- TH62 özel düzeltmesi ---
for (const id in finalData) {
  if (finalData[id].title === "TH62") {
    finalData[id].katalog =
      "https://www.asistal.com/storage/products/media/4148/th62-ths62-2025-v3.pdf";
  }
}
// --- katalog089 özel düzeltmesi ---
if (finalData["katalog089"]) {
  finalData["katalog089"].katalog =
    "https://asistal.com/storage/brochures/media/272/asistal-genel-brosur.pdf";
}

    res.status(200).json(finalData);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
