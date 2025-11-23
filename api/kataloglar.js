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

    // viewer-box elemanları DOM'a yüklenene kadar bekle
    await page.waitForSelector(".viewer-box");

    const data = await page.evaluate(() => {
      const items = document.querySelectorAll(".viewer-box");
      const result = {};

      items.forEach((box) => {
        const titleEl = box.querySelector(".title");
        if (!titleEl) return;

        const rawTitle = titleEl.innerText.trim();
        const code = rawTitle.split(" ")[0].toUpperCase();

        if (!result[code]) {
          result[code] = { katalog: null, montaj: null, test: null };
        }

        const links = box.querySelectorAll("a[href$='.pdf']");
        links.forEach((a) => {
          const url = "https://asistal.com" + a.getAttribute("href");
          const name = url.toLowerCase();

          if (name.includes("montaj")) result[code].montaj = url;
          else if (name.includes("test")) result[code].test = url;
          else result[code].katalog = url;
        });
      });

      return result;
    });

    await browser.close();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
