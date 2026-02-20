import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import crypto from "crypto";

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
      SERTİFİKA SCRAPER + MANIFEST HASH
   --------------------------------------------------- */
   function normalizeText(s) {
     return (s || "")
       .toLowerCase()
       .replaceAll("ı", "i")
       .replaceAll("İ", "i")
       .replaceAll("ş", "s")
       .replaceAll("ğ", "g")
       .replaceAll("ü", "u")
       .replaceAll("ö", "o")
       .replaceAll("ç", "c");
   }
   
   function classifyCert(url, labelText) {
     const s = normalizeText(url) + " " + normalizeText(labelText);
   
     if (s.includes("qualanod")) return "QUALANOD";
     if (s.includes("qualicoat")) return "QUALICOAT";
     if (s.includes("iatf")) return "IATF";
     if (s.includes("iso")) return "ISO";
     if (s.includes("ce")) return "CE";
     if (s.includes("ts")) return "TS";
     if (s.includes("asistal")) return "ASİSTAL";
   
     return null;
   }
   
   function sha256(text) {
     return crypto.createHash("sha256").update(text).digest("hex");
   }
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
      DİNAMİK SERTİFİKA YAKALAMA
   --------------------------------------------------- */
   
   const certItems = await page.evaluate(() => {
     const out = [];
   
     document.querySelectorAll("a[href$='.pdf']").forEach(a => {
       const href = a.getAttribute("href");
       if (!href) return;
   
       const url = href.startsWith("http")
         ? href
         : "https://asistal.com" + href;
   
       if (!url.toLowerCase().includes("/storage/certificates/")) return;
   
       out.push({
         url,
         labelText: (a.innerText || "").trim()
       });
     });
   
     return out;
   });
   
   const certificateGroups = {};
   
   for (const item of certItems) {
     const group = classifyCert(item.url, item.labelText);
     if (!group) continue;
   
     certificateGroups[group] ??= [];
     if (!certificateGroups[group].includes(item.url)) {
       certificateGroups[group].push(item.url);
     }
   }
   
   // HASH ÜRET
   const flatList = Object.keys(certificateGroups)
     .sort()
     .flatMap(k => certificateGroups[k].sort().map(u => k + "|" + u))
     .join("\n");
   
   const certificateManifestHash = sha256(flatList);
   const certificateVersion = new Date().toISOString().slice(0, 10);
     
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

    res.status(200).json({
     meta: {
       certificates_version: certificateVersion,
       certificates_manifest_hash: certificateManifestHash,
       certificates_groups: certificateGroups
     },
     data: finalData
   });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
}
