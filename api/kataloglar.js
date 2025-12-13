import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/* ---------------------------------------------------
   PDF TÜRÜNÜ İNSAN GİBİ TAHMİN EDEN FONKSİYON
--------------------------------------------------- */
function inferDocumentType(url) {
  const name = url.toLowerCase();

  let score = {
    katalog: 1, // varsayılan
    montaj: 0,
    kesim: 0,
    test: 0
  };

  // Montaj sinyalleri
  if (name.includes("montaj")) score.montaj += 3;
  if (name.includes("kurulum")) score.montaj += 3;
  if (name.includes("assembly")) score.montaj += 3;
  if (name.match(/[-_](m|montaj)[-_]/)) score.montaj += 2;

  // Kesim sinyalleri
  if (name.includes("kesit")) score.kesim += 3;
  if (name.includes("-m-v")) score.kesim += 3;
  if (name.includes("section")) score.kesim += 2;

  // Test sinyalleri
  if (name.includes("test")) score.test += 3;
  if (name.includes("performans")) score.test += 2;

  let best = "katalog";
  for (const k in score) {
    if (score[k] > score[best]) best = k;
  }

  return {
    type: best,
    confidence: Math.min(1, score[best] / 5)
  };
}

export default async function handler(req, res) {
  try {
    const url = "https://asistal.com/tr/tum-kataloglar";

    // ID MAP
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

    /* ---------------------------------------------------
       HAM VERİ TOPLAMA (HV + SKY + FC50 KORUNUR)
    --------------------------------------------------- */
    const rawData = await page.evaluate(() => {
      const result = {};
      const items = document.querySelectorAll(".viewer-box");

      function ensure(code) {
        if (!result[code]) {
          result[code] = {
            katalog: null,
            montaj: null,
            kesim: null,
            test: null,
            documents: []
          };
        }
      }

      items.forEach(box => {
        const titleEl = box.querySelector(".title");
        if (!titleEl) return;

        const rawTitle = titleEl.innerText.trim();
        const code = rawTitle.split(" ")[0].toUpperCase();

        ensure(code);

        box.querySelectorAll("a[href$='.pdf']").forEach(a => {
          const pdfUrl = "https://asistal.com" + a.getAttribute("href");
          const lower = pdfUrl.toLowerCase();

          // --- FC50N ---
          if (lower.includes("fc50n")) {
            ensure("FC50");
            result["FC50"].documents.push(pdfUrl);
            return;
          }

          // --- FC50SKY ---
          if (lower.includes("fc50-sky")) {
            ensure("FC50SKY");
            result["FC50SKY"].documents.push(pdfUrl);
            return;
          }

          // --- TH62HV ---
          if (lower.includes("th62-hv")) {
            ensure("TH62HV");
            result["TH62HV"].documents.push(pdfUrl);
            return;
          }

          // Normal
          result[code].documents.push(pdfUrl);
        });
      });

      return result;
    });
	
	/* ---------------------------------------------------
	   PROFİL / KATEGORİ KATALOGLARI (KONTROLLÜ)
	--------------------------------------------------- */
	const profileData = await page.evaluate(() => {
	  const map = {
	    STANDART: ["standart-profiller"],
	    AL: ["aldoks"],
	    TUBA: ["tuba-profilleri"],
	    İZMİR: ["izmir-alkan"],
	    DENİZLİK: ["denizlik-profilleri"],
	    DUŞAKABİN: ["dusakabin-profilleri"],
	    GRİYAJ: ["griyaj-profilleri"],
	    GÜNEŞ: ["gunes-kirici"],
	    PANJUR: ["panjur-profilleri"],
	    LAMBİRİ: ["lambri-profilleri"],
	    MENFEZ: ["menfez-profilleri"],
	    STOR: ["stor-perde"],
	    SİNEKLİK: ["sineklik-profilleri"],
	    TIR: ["tir-profilleri"],
	    KLİPSLİ: ["klipsli"],
	    DAMLALIK: ["damlalik"],
	    PERVAZ: ["pervaz-profilleri"],
	    KOMPOZİT: ["kompozit"],
	    MOBİLYA: ["mobilya-profilleri"],
	    ÖZEL: ["ozel-profiller"],
	    KÜPEŞTE: ["kupeste-profiller"],
	    PLİSE: ["plise"],
	    SÜPÜRGELİK: ["supurgelik"],
	    COTTA: ["cotta"],
	    ECORAIL: ["ecorail"]
	  };
	
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
	
	    if (
	      lower.includes("/storage/profiles/") ||
	      lower.includes("/storage/brochures/")
	    ) {
	      for (const code in map) {
	        if (map[code].some(key => lower.includes(key))) {
	          push(code, url);
	          break; // SADECE 1 profile girsin
	        }
	      }
	    }
	  });
	
	  return result;
	});

	
	/* ---------------------------------------------------
	   PROFİL VERİSİNİ RAWDATA'YA MERGE ET
	--------------------------------------------------- */
	for (const code of Object.keys(profileData)) {
	  if (!rawData[code]) {
		rawData[code] = {
		  katalog: null,
		  montaj: null,
		  kesim: null,
		  test: null,
		  documents: []
		};
	  }

	  profileData[code].forEach(url => {
		// Aynı PDF iki kez eklenmesin
		if (!rawData[code].documents.includes(url)) {
		  rawData[code].documents.push(url);
		}
	  });
	}

    await browser.close();

    /* ---------------------------------------------------
       SON JSON OLUŞTURMA (id_map + documents)
    --------------------------------------------------- */
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

        // GERİYE UYUMLU alanlar
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

    /* ---------------------------------------------------
       ÖZEL OVERRIDE’LAR (ESKİ DAVRANIŞ AYNEN KORUNUR)
    --------------------------------------------------- */

    // P55
    if (finalData["katalog058"]) {
      finalData["katalog058"].katalog =
        "https://www.asistal.com/storage/products/media/1977/p55-2024-v1.pdf";
      finalData["katalog058"].kesim =
        "https://www.asistal.com/storage/products/media/1984/p55-2024-m-v1.pdf";
    }

    // TH62 ana katalog
    for (const id in finalData) {
      if (finalData[id].title === "TH62") {
        finalData[id].katalog =
          "https://www.asistal.com/storage/products/media/4148/th62-ths62-2025-v3.pdf";
      }
    }

    // FC50 katalog override
    if (finalData["katalog035"]) {
      finalData["katalog035"].katalog =
        "https://asistal.com/storage/products/media/4120/fc50n-2025-v2.pdf";
    }

    // GENEL BROŞÜR
    if (finalData["katalog089"]) {
      finalData["katalog089"].katalog =
        "https://asistal.com/storage/brochures/media/272/asistal-genel-brosur.pdf";
    }

    res.status(200).json(finalData);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
