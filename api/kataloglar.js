import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

function inferDocumentType(url) {
  const name = url.toLowerCase();

  let score = {
    katalog: 0,
    montaj: 0,
    kesim: 0,
    test: 0
  };

  // --- Montaj sinyalleri ---
  if (name.includes("montaj")) score.montaj += 3;
  if (name.includes("kurulum")) score.montaj += 3;
  if (name.includes("assembly")) score.montaj += 3;
  if (name.match(/[-_](m|montaj)[-_]/)) score.montaj += 2;

  // --- Kesim sinyalleri ---
  if (name.includes("kesit")) score.kesim += 3;
  if (name.includes("-m-v")) score.kesim += 3;
  if (name.includes("section")) score.kesim += 2;

  // --- Test sinyalleri ---
  if (name.includes("test")) score.test += 3;
  if (name.includes("performans")) score.test += 2;

  // --- Katalog varsayılan ---
  score.katalog += 1;

  // En yüksek skoru seç
  let type = "katalog";
  let confidence = 0.5;

  for (const key in score) {
    if (score[key] > score[type]) {
      type = key;
      confidence = Math.min(1, score[key] / 5);
    }
  }

  return { type, confidence };
}

export default async function handler(req, res) {
  try {
    const url = "https://asistal.com/tr/tum-kataloglar";

    const idMapUrl =
      "https://raw.githubusercontent.com/Khejah/asistal-scraper/main/id_map.json";
    const idMap = await fetch(idMapUrl).then(r => r.json());

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector(".viewer-box");

    const rawData = await page.evaluate(() => {
      const result = {};
      const items = document.querySelectorAll(".viewer-box");

      items.forEach(box => {
        const titleEl = box.querySelector(".title");
        if (!titleEl) return;

        const rawTitle = titleEl.innerText.trim();
        const code = rawTitle.split(" ")[0].toUpperCase();

        if (!result[code]) {
          result[code] = {
            katalog: null,
            montaj: null,
            kesim: null,
            test: null,
            documents: []
          };
        }

        box.querySelectorAll("a[href$='.pdf']").forEach(a => {
          const pdfUrl = "https://asistal.com" + a.getAttribute("href");
          result[code].documents.push(pdfUrl);
        });
      });

      return result;
    });

    await browser.close();

    const finalData = {};

    for (const code of Object.keys(rawData)) {
      if (!idMap[code]) continue;

      const id = idMap[code];
      const entry = rawData[code];

      const documents = [];

      entry.documents.forEach(url => {
        const inferred = inferDocumentType(url);

        documents.push({
          type: inferred.type,
          confidence: inferred.confidence,
          url
        });

        // --- GERİYE UYUMLU ALANLAR ---
        if (!entry[inferred.type]) {
          entry[inferred.type] = url;
        }
      });

      finalData[id] = {
        id,
        title: code,
        katalog: entry.katalog,
        montaj: entry.montaj,
        kesim: entry.kesim,
        test: entry.test,
        documents
      };
    }

    res.status(200).json(finalData);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
