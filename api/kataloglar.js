import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const url = "https://asistal.com/tr/tum-kataloglar";

    // --- 1) ID MAP JSON'u GitHub REPO ROOT'TAN OKU ---
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

    // --- 2) Asistal sayfasından PDF linklerini çek ---
    const rawData = await page.evaluate(() => {
      const result = {};
      const items = document.querySelectorAll(".viewer-box");

      items.forEach((box) => {
        const isLink = box.tagName.toLowerCase() === "a";

        const titleEl = box.querySelector(".title");
        if (!titleEl) return;

        const rawTitle = titleEl.innerText.trim();
        const code = rawTitle.split(" ")[0].toUpperCase();

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

          if (name.includes("montaj") || name.match(/-\dm-|-[a-z]m-|[-_]m[-_]/)) {
            obj.montaj = url;
            return;
          }

          if (name.includes("test")) {
            obj.test = url;
            return;
          }

          obj.katalog = url;
        }

        if (isLink) {
          const url = "https://asistal.com" + box.getAttribute("href");
          assignType(result[code], url);
        } else {
          const links = box.querySelectorAll("a[href$='.pdf']");
          links.forEach((a) => {
            const url = "https://asistal.com" + a.getAttribute("href");
            assignType(result[code], url);
          });
        }
      });

      return result;
    });

    await browser.close();

    // --- 3) ID MAP'e göre çıktıyı ID → içerik olarak düzenle ---
    const finalData = {};

    for (const code of Object.keys(rawData)) {
      if (!idMap[code]) {
        // ID MAP'te yoksa bu katalog atlanır (sabit sistem bozulmasın diye)
        continue;
      }

      const id = idMap[code];

      finalData[id] = {
        id: id,
        title: code,
        katalog: rawData[code].katalog,
        montaj: rawData[code].montaj,
        test: rawData[code].test,
        kesim: rawData[code].kesim
      };
    }

    // --- 4) P55 özel düzeltmesi ---
    for (const id in finalData) {
      if (finalData[id].title === "P55") {
        finalData[id].katalog =
          "https://www.asistal.com/storage/products/media/1977/p55-2024-v1.pdf";
        finalData[id].kesim =
          "https://www.asistal.com/storage/products/media/1984/p55-2024-m-v1.pdf";
      }
    }

    res.status(200).json(finalData);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}