import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/* ---------------------------------------------------
   PDF TÜRÜNÜ İNSAN GİBİ TAHMİN EDEN FONKSİYON
--------------------------------------------------- */
function inferDocumentType(url) {
  const name = url.toLowerCase();

  let score = {
    katalog: 1,
    montaj: 0,
    kesim: 0,
    test: 0
  };

  if (name.includes("montaj")) score.montaj += 3;
  if (name.includes("kurulum")) score.montaj += 3;
  if (name.match(/[-_](m|montaj)[-_]/)) score.montaj += 2;

  if (name.includes("kesit")) score.kesim += 3;
  if (name.includes("-m-v")) score.kesim += 3;

  if (name.includes("test")) score.test += 3;

  let best = "katalog";
  for (const k in score) {
    if (score[k] > score[best]) best = k;
  }

  return { type: best, confidence: Math.min(1, score[best] / 5) };
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

    /* ---------------------------------------------------
       HAM ÜRÜN VERİSİ
    --------------------------------------------------- */
    const rawData = await page.evaluate(() => {
      const result = {};

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

      document.querySelectorAll(".viewer-box").forEach(box => {
        const titleEl = box.querySelector(".title");
        if (!titleEl) return;

        const code = titleEl.innerText.trim().split(" ")[0].toUpperCase();
        ensure(code);

        box.querySelectorAll("a[href$='.pdf']").forEach(a => {
          const url = "https://asistal.com" + a.getAttribute("href");
          const lower = url.toLowerCase();

          if (lower.includes("fc50n")) {
            ensure("FC50");
            result["FC50"].documents.push(url);
            return;
          }

          if (lower.includes("fc50-sky")) {
            ensure("FC50SKY");
            result["FC50SKY"].documents.push(url);
            return;
          }

          if (lower.includes("th62-hv")) {
            ensure("TH62HV");
            result["TH62HV"].documents.push(url);
            return;
          }

          result[code].documents.push(url);
        });
      });

      return result;
    });

    /* ---------------------------------------------------
       PROFİL / KATEGORİ KATALOGLARI
    --------------------------------------------------- */
    const profileData = await page.evaluate(() => {
      const map = {
        STANDART: ["standart-profiller"],
        ECORAIL: ["ecorail-kupeste"],
        PLİSE: ["plise-sineklik"],
        KÜPEŞTE: ["kupeste-profiller"],
        SİNEKLİK: ["sineklik-profilleri"],
        ALDOKS: ["aldoks-"],
        TUBA: ["tuba-"],
        İZMİR: ["izmir-alkan"],
        DENİZLİK: ["denizlik-profilleri"],
        DUŞAKABİN: ["dusakabin-profilleri"],
        GRİYAJ: ["griyaj-profilleri"],
        GÜNEŞ: ["gunes-kirici"],
        PANJUR: ["panjur-profilleri"],
        LAMBİRİ: ["lambri-profilleri"],
        MENFEZ: ["menfez-profilleri"],
        STOR: ["stor-perde"],
        TIR: ["tir-profilleri"],
        KLİPSLİ: ["klipsli"],
        DAMLALIK: ["damlalik"],
        PERVAZ: ["pervaz-profilleri"],
        KOMPOZİT: ["kompozit"],
        MOBİLYA: ["mobilya-profilleri"],
        ÖZEL: ["ozel-profiller"],
        SÜPÜRGELİK: ["supurgelik"],
        COTTA: ["cotta"]
      };

      const result = {};

      function push(code, url) {
        if (!result[code]) result[code] = [];
        result[code].push(url);
      }

      document.querySelectorAll("a[href$='.pdf']").forEach(a => {
        const url = "https://asistal.com" + a.getAttribute("href");
        const lower = url.toLowerCase();

        if (
          lower.includes("/storage/profiles/") ||
          lower.includes("/storage/brochures/")
        ) {
          for (const code in map) {
            if (lower.includes("plise-sineklik") && code === "SİNEKLİK") continue;
            if (map[code].some(k => lower.includes(k))) {
              push(code, url);
              break;
            }
          }
        }
      });

      return result;
    });

    /* ---------------------------------------------------
       RAWDATA MERGE
    --------------------------------------------------- */
    for (const code in profileData) {
      rawData[code] ??= { katalog: null, montaj: null, kesim: null, test: null, documents: [] };
      profileData[code].forEach(u => {
        if (!rawData[code].documents.includes(u)) rawData[code].documents.push(u);
      });
    }

    /* ---------------------------------------------------
       SABİT PDF EŞLEŞTİRME (KALİTE / TEST / AR)
    --------------------------------------------------- */
    const fixedDocuments = {
      IATF: ["zZ9PHQ7hONoOl4ia8sBm.pdf"],
      ISO: [
        "zYK0j5fYzEIh7fcgx0Yn.pdf",
        "l1YH2lC2eYWEcLqZX1qy.pdf",
        "EQ7ta0vHbmls6B9CpyMT.pdf",
        "qzvW6vuXTGgPG3sWHFgB.pdf"
      ],
      CE: [
        "wy0whmvRQLtZevgNiqvV.pdf",
        "QrRkDaRJD4k1PfekVwag.pdf"
      ],
      QUALANOD: ["yauRVx9pvR7q0JrmC1Jj.pdf"],
      QUALICOAT: ["QyBlABvWJlZHUja6bw58.pdf"],
      TS: [
        "VhqswH6Bdv1gPNxLsMbI.pdf",
        "557EuA0gSOAg3ratxfHz.pdf",
        "31t4j1AM47CIBbrt2v3G.pdf"
      ],
      TS_TEST: [
        "0IL9bJMbYbawkg2RJMEX.pdf",
        "ZWOsC09thj7M2zuoWa04.pdf",
        "lQ6OZtpi9gg4t32zMkwx.pdf",
        "yT71CDXq3wEskg8YCp1Q.pdf",
        "KSGMUcZALOCGHwGLXhF4.pdf",
        "Rk8vOkhCWmaRetlAmEYK.pdf",
        "gJjSBcbg9vQXdRUC4LK9.pdf"
      ],
      ASİSTAL: ["asistal-ar.pdf"]
    };

    for (const key in fixedDocuments) {
      const code = key === "TS_TEST" ? "TS" : key;
      rawData[code] ??= { katalog: null, montaj: null, kesim: null, test: null, documents: [] };

      fixedDocuments[key].forEach(file => {
        const found = Object.values(rawData)
          .flatMap(e => e.documents)
          .find(u => u.endsWith(file));

        if (found && !rawData[code].documents.includes(found)) {
          rawData[code].documents.push(found);
          if (key === "TS_TEST") rawData[code].test ??= found;
          else rawData[code].katalog ??= found;
        }
      });
    }
     /* ---------------------------------------------------
      KURUMSAL / KALİTE / TEST PDF’LERİ (SABİT – DOĞRU YOLLAR)
   --------------------------------------------------- */
   const corporateStatic = {
     IATF: [
       "https://asistal.com/storage/certificates/zZ9PHQ7hONoOl4ia8sBm.pdf"
     ],
   
     ISO: [
       "https://asistal.com/storage/certificates/zYK0j5fYzEIh7fcgx0Yn.pdf", // ISO 9001
       "https://asistal.com/storage/certificates/l1YH2lC2eYWEcLqZX1qy.pdf", // ISO 14001
       "https://asistal.com/storage/certificates/EQ7ta0vHbmls6B9CpyMT.pdf", // ISO 45001
       "https://asistal.com/storage/certificates/qzvW6vuXTGgPG3sWHFgB.pdf"  // ISO 50001
     ],
   
     CE: [
       "https://asistal.com/storage/certificates/wy0whmvRQLtZevgNiqvV.pdf", // EN 15088 CRP
       "https://asistal.com/storage/certificates/QrRkDaRJD4k1PfekVwag.pdf"  // TR 15088 CPR
     ],
   
     QUALANOD: [
       "https://asistal.com/storage/certificates/yauRVx9pvR7q0JrmC1Jj.pdf"
     ],
   
     QUALICOAT: [
       "https://asistal.com/storage/certificates/QyBlABvWJlZHUja6bw58.pdf"
     ],
   
     TS: [
       "https://asistal.com/storage/certificates/VhqswH6Bdv1gPNxLsMbI.pdf", // TS EN 12020
       "https://asistal.com/storage/certificates/557EuA0gSOAg3ratxfHz.pdf", // TS 4922
       "https://asistal.com/storage/certificates/31t4j1AM47CIBbrt2v3G.pdf"  // TS EN 755
     ],
   
     ASİSTAL: [
       "https://asistal.com/storage/blocks/media/228/asistal-ar.pdf"
     ]
   };
   
   for (const code in corporateStatic) {
     if (!rawData[code]) {
       rawData[code] = {
         katalog: null,
         montaj: null,
         kesim: null,
         test: null,
         documents: []
       };
     }
   
     corporateStatic[code].forEach(url => {
       if (!rawData[code].documents.includes(url)) {
         rawData[code].documents.push(url);
       }
     });
   }
   await browser.close();

    /* ---------------------------------------------------
       SON JSON
    --------------------------------------------------- */
    const finalData = {};

    for (const code in rawData) {
      if (!idMap[code]) continue;

      const entry = rawData[code];
      const docs = [];

      entry.documents.forEach(url => {
        const inf = inferDocumentType(url);
        docs.push({ type: inf.type, confidence: inf.confidence, url });
        entry[inf.type] ??= url;
      });

      finalData[idMap[code]] = {
        id: idMap[code],
        title: code,
        katalog: entry.katalog,
        montaj: entry.montaj,
        kesim: entry.kesim,
        test: entry.test,
        documents: docs
      };
    }

    res.status(200).json(finalData);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
