import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  try {
    const url = "https://asistal.com/tr/tum-kataloglar";

    // ID MAP JSON GITHUB ROOT
    const idMapUrl = "https://raw.githubusercontent.com/Khejah/asistal-scraper/main/id_map.json";
    const idMap = await fetch(idMapUrl).then((r) => r.json());

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
        try {
          const titleEl = box.querySelector(".title");
          if (!titleEl) return;

          let rawTitle = titleEl.innerText.trim();

          // Normalize title (unicode temizliği)
          rawTitle = rawTitle
            .normalize("NFKD")
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();

          const parts = rawTitle.split(/\s+/);
          let code = "";

          // 1) HARF GRUBU (SL, TH, AS, AB, TM...)
          if (parts[0] && /^[A-Za-z]+$/.test(parts[0])) {
            code += parts[0].toUpperCase();
          }

          // 2) SAYI GRUBU (38, 62, 55, 130...)
          if (parts[1] && /^[0-9]+$/.test(parts[1])) {
            code += parts[1];
          }

          // 3) EK HARF (T, HV, K...)
          if (parts[2] && /^[A-Za-z]+$/.test(parts[2])) {
            code += parts[2].toUpperCase();
          }

          if (!code) return;

          if (!result[code]) {
            result[code] = {
              katalog: null,
              montaj: null,
              test: null,
              kesim: null,
            };
          }

          function assignType(obj, url) {
            const name = url.toLowerCase();

            if (name.includes("-m-v1.pdf")) {
              obj.kesim = url;
              return;
            }

            if (
              name.includes("montaj") ||
              name.match(/-\dm-|-[a-z]m-|[-_]m[-_]/)
            ) {
              obj.montaj = url;
              return;
            }

            if (name.includes("test")) {
              obj.test = url;
              return;
            }

            obj.katalog = url;
          }

          // PDF linklerini çek
          box.querySelectorAll("a[href$='.pdf']").forEach((a) => {
            assignType(
              result[code],
              "https://asistal.com" + a.getAttribute("href")
            );
          });

        } catch (e) {
          console.error("evaluate error:", e);
        }
      });

      return result;
    });

    await browser.close();

    const finalData = {};

    // ID MAP eşleştirme
    for (const code of Object.keys(rawData)) {
      if (!idMap[code]) continue;

      const id = idMap[code];
      finalData[id] = {
        id,
        title: code,
        katalog: rawData[code].katalog,
        montaj: rawData[code].montaj,
        test: rawData[code].test,
        kesim: rawData[code].kesim,
      };
    }

    // ÖZEL DÜZELTMELER
    if (finalData["katalog058"]) {
      finalData["katalog058"].katalog =
        "https://www.asistal.com/storage/products/media/1977/p55-2024-v1.pdf";
      finalData["katalog058"].kesim =
        "https://www.asistal.com/storage/products/media/1984/p55-2024-m-v1.pdf";
    }

    for (const id in finalData) {
      if (finalData[id].title === "TH62") {
        finalData[id].katalog =
          "https://www.asistal.com/storage/products/media/4148/th62-ths62-2025-v3.pdf";
      }
    }

    if (finalData["katalog089"]) {
      finalData["katalog089"].katalog =
        "https://asistal.com/storage/brochures/media/272/asistal-genel-brosur.pdf";
    }

    res.status(200).json(finalData);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
