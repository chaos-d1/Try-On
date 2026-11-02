import fs from "node:fs";
import path from "node:path";

/**
 * A provider takes a person image + garment image (file paths under /uploads and
 * public URLs) and returns the file name of the generated result inside /uploads.
 */
const mock = {
  async run({ personPath, outPath }) {
    // Dev stub: just copies the person photo so the whole flow can be tested.
    await new Promise((r) => setTimeout(r, 1500));
    fs.copyFileSync(personPath, outPath);
  },
};

const replicate = {
  async run({ personUrl, garmentUrl, outPath, category }) {
    const token = process.env.REPLICATE_API_TOKEN;
    const version = process.env.REPLICATE_MODEL_VERSION;
    if (!token || !version) throw new Error("Replicate is not configured");

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    // Input field names follow IDM-VTON; adjust if you use a different model.
    const create = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        version,
        input: { human_img: personUrl, garm_img: garmentUrl, garment_des: category || "clothing" },
      }),
    });
    if (!create.ok) throw new Error(`Replicate error ${create.status}: ${await create.text()}`);
    let pred = await create.json();

    const deadline = Date.now() + 5 * 60 * 1000;
    while (!["succeeded", "failed", "canceled"].includes(pred.status)) {
      if (Date.now() > deadline) throw new Error("Try-on timed out");
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(pred.urls.get, { headers });
      pred = await res.json();
    }
    if (pred.status !== "succeeded") throw new Error(pred.error || `Prediction ${pred.status}`);

    const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    const img = await fetch(outputUrl);
    if (!img.ok) throw new Error("Could not download result image");
    fs.writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
  },
};

const providers = { mock, replicate };

export async function generateTryOn(args) {
  const p = providers[process.env.TRYON_PROVIDER || "mock"];
  if (!p) throw new Error("Unknown TRYON_PROVIDER");
  return p.run(args);
}
