import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/* -------------------------------------------
   PDF TÜRÜ TAHMİNİ
------------------------------------------- */
function inferDocumentType(url) {
  const name = url.toLowerCase();
  let score = { katalog: 1, montaj: 0, kesim: 0, test: 0 };

  if (name.includes("montaj") || name.includes("kurulum")) score.montaj += 3;
  if (name.includes("assembly")) score.montaj += 2;
  if (name.includes("kesit") || name.includes("-m-v")) score.kesim += 3;
  if (name.includes("test")) score.test += 3;

  let best = "katalog";
  for (const k in score) if (score[k] > score[best]) best = k;

  return { type: best, confidence: Math.min(1, score[best] / 5) };
}

/* -------------------------------------------
   ANA HANDLER
------------------------------------------- */
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

     /* ---------------------------------------------------
		   SERTİFİKALAR (AYRI, TEMİZ, KONTROLLÜ)
		--------------------------------------------------- */
		const certificateData = await page.evaluate(() => {
		  const result = {};
		
		  function push(code, url) {
		    if (!result[code]) result[code] = [];
		    result[code].push(url);
		  }
		
		  document.querySelectorAll("a[href$='.pdf']").forEach(a => {
		    const href = a.getAttribute("href");
		    if (!href) return;
		
		    const url = "https://asistal.com" + href;
		    const lower = url.toLowerCase();
		
		    // SADECE sertifika alanları
		    if (
		      lower.includes("/storage/certificates/") ||
		      lower.includes("/storage/reports/")
		    ) {
		      if (lower.includes("iatf")) push("IATF", url);
		      else if (lower.includes("iso")) push("ISO", url);
		      else if (lower.includes("ce")) push("CE", url);
		      else if (lower.includes("qualanod")) push("QUALANOD", url);
		      else if (lower.includes("qualicoat")) push("QUALICOAT", url);
		      else if (lower.includes("ts")) push("TS", url);
		      else if (lower.includes("asistal")) push("ASİSTAL", url);
		    }
		  });
		
		  return result;
		});

    /* -------------------------------------------
       TÜM PDF’LERİ TOPLA
    ------------------------------------------- */
    const allPdfs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href$='.pdf']"))
        .map(a => "https://asistal.com" + a.getAttribute("href"));
    });

    await browser.close();

    /* -------------------------------------------
       RAW MAP
    ------------------------------------------- */
    const rawData = {};

    function ensure(code) {
      if (!rawData[code]) {
        rawData[code] = {
          katalog: null,
          montaj: null,
          kesim: null,
          test: null,
          documents: []
        };
      }
    }

	  /* ---------------------------------------------------
		   SERTİFİKALARI RAW DATA'YA EKLE
		--------------------------------------------------- */
		for (const code of Object.keys(certificateData)) {
		  if (!rawData[code]) {
		    rawData[code] = {
		      katalog: null,
		      montaj: null,
		      kesim: null,
		      test: null,
		      documents: []
		    };
		  }
		
		  certificateData[code].forEach(url => {
		    rawData[code].documents.push(url);
		  });
		}
	
    /* -------------------------------------------
       PDF’LERİ CODE’A BAĞLA
    ------------------------------------------- */
    for (const pdfUrl of allPdfs) {
      const lower = pdfUrl.toLowerCase();

      // ÖZEL AYRIMLAR
      if (lower.includes("th62-hv")) {
        ensure("TH62HV");
        rawData["TH62HV"].documents.push(pdfUrl);
        continue;
      }
      if (lower.includes("fc50-sky")) {
        ensure("FC50SKY");
        rawData["FC50SKY"].documents.push(pdfUrl);
        continue;
      }

      // ID MAP üzerinden eşleştir
      for (const code of Object.keys(idMap)) {
        const normalized = code.toLowerCase().replace(/\s+/g, "");
        if (lower.includes(normalized)) {
          ensure(code);
          rawData[code].documents.push(pdfUrl);
          break;
        }
      }
    }

    /* -------------------------------------------
       FINAL JSON
    ------------------------------------------- */
    const finalData = {};

    for (const code of Object.keys(rawData)) {
      if (!idMap[code]) continue;

      const id = idMap[code];
      const entry = rawData[code];
      const documents = [];

      entry.documents.forEach(url => {
        const inferred = inferDocumentType(url);
        documents.push({ type: inferred.type, confidence: inferred.confidence, url });
        if (!entry[inferred.type]) entry[inferred.type] = url;
      });

      finalData[id] = {
        id,
        title: code,
        katalog: entry.katalog,
        montaj: entry.montaj,
        kesim: entry.kesim,
        test: entry.test,
        documents,
        status: documents.length > 0 ? "OK" : "NO_PDF"
      };
    }

    res.status(200).json(finalData);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
