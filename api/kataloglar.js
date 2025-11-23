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
          result[code] = { katalog: null, montaj: null, test: null };
        }

        // Eğer box <a> ise PDF linki direkt href'tedir
        if (isLink) {
          const url = "https://asistal.com" + box.getAttribute("href");
          assignType(result[code], url);
        } else {
          // Eski tip kart: <div> içinde <a>
          const links = box.querySelectorAll("a[href$='.pdf']");
          links.forEach((a) => {
            const url = "https://asistal.com" + a.getAttribute("href");
            assignType(result[code], url);
          });
        }
      });

      function assignType(obj, url) {
        const name = url.toLowerCase();
        if (name.includes("montaj")) obj.montaj = url;
        else if (name.includes("test")) obj.test = url;
        else obj.katalog = url;
      }

      return result;
    });

    await browser.close();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
