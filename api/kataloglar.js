import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  try {
    const url = "https://asistal.com/tr/tum-kataloglar";

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });

    await page.waitForSelector(".viewer-box");

    const data = await page.evaluate(() => {
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

          // ❌ "m-v1.pdf" katalog değildir → kesim dosyasıdır
          if (name.includes("-m-v1.pdf")) {
            return;
          }

          if (name.includes("montaj")) obj.montaj = url;
          else if (name.includes("test")) obj.test = url;
          else obj.katalog = url;
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

    // ⭐ Doğru P55 katalog & kesim tablosu atama
    if (data["P55"]) {
      data["P55"].katalog = "https://www.asistal.com/storage/products/media/1977/p55-2024-v1.pdf";
      data["P55"].kesim   = "https://www.asistal.com/storage/products/media/1984/p55-2024-m-v1.pdf";
    }

    await browser.close();
    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
