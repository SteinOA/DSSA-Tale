const fs = require("fs");
const crypto = require("crypto");
const verified = new Map();
async function verifyModelFile(filePath, expected) {
  const stat = await fs.promises.stat(filePath);
  if (stat.size !== expected.expectedSizeBytes)
    throw Error("Modellfilen har feil størrelse. Filen er beholdt; last ned en ny kopi før bruk.");
  const key = `${filePath}:${stat.size}:${stat.mtimeMs}`;
  if (verified.get(key) === expected.sha256) return;
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  if (hash.digest("hex") !== expected.sha256)
    throw Error(
      "Modellfilens SHA-256 stemmer ikke med Nasjonalbibliotekets kilde. Filen er beholdt; velg en kontrollert kopi."
    );
  verified.set(key, expected.sha256);
}
module.exports = { verifyModelFile };
