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

        const rawTitle = titleEl.innerText.trim();
        const code = rawTitle.split(" ")[0].toUpperCase();

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
            const pdfUrl = "https://asistal.com" + a.getAttribute("href");
            const lower = pdfUrl.toLowerCase();

            // FC50N tespiti → URL içinde her zaman “fc50n” geçer
            if (lower.includes("fc50n")) {
              if (!result["FC50N"]) {
                result["FC50N"] = { katalog: null, montaj: null, test: null, kesim: null };
              }
              assignType(result["FC50N"], pdfUrl);
              return;
            }

            // FC50-SKY tespiti → URL içinde her zaman “fc50-sky” geçer
            if (lower.includes("fc50-sky")) {
              if (!result["FC50SKY"]) {
                result["FC50SKY"] = { katalog: null, montaj: null, test: null, kesim: null };
              }
              assignType(result["FC50SKY"], pdfUrl);
              return; // FC50 olarak işleme!
            }

            // TH62HV tespiti → URL içinde her zaman “th62-hv” geçer
            if (lower.includes("th62-hv")) {
              if (!result["TH62HV"]) {
                result["TH62HV"] = { katalog: null, montaj: null, test: null, kesim: null };
              }
              assignType(result["TH62HV"], pdfUrl);
              return; // artık TH62 olarak işleme!
            }

            // Normal işleme
            assignType(result[code], pdfUrl);
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

    // --- P55 (katalog058) özel düzeltmesi ---
    if (finalData["katalog058"]) {
      finalData["katalog058"].katalog =
        "https://www.asistal.com/storage/products/media/1977/p55-2024-v1.pdf";
      finalData["katalog058"].kesim =
        "https://www.asistal.com/storage/products/media/1984/p55-2024-m-v1.pdf";
    }

    // --- TH62 özel düzeltmesi (varsa) ---
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
    
    // --- FC50 katalog override ---
    if (finalData["katalog035"]) {
      finalData["katalog035"].katalog =
        "https://asistal.com/storage/products/media/4120/fc50n-2025-v2.pdf";
    }

    // --- TH62HV otomatik eşleştirme (CRASH-SAFE SÜRÜM) ---
    for (const id in finalData) {
      if (!finalData[id] || !finalData[id].title) continue;  // CRASH ÖNLEYİCİ
        
      const normalized = finalData[id].title
        .toString()
        .replace(/\s+/g, "")
        .toUpperCase();

      if (normalized === "TH62 HV") {
        finalData["katalog092"] = finalData[id];
      }
    }

    res.status(200).json(finalData);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
