const PREFIX = "dssa-calendar:v1:";
function encode(value) {
  if (value == null || value === "") return value;
  return PREFIX + require("./secretCrypto").encrypt(String(value)).toString("base64");
}
function decodeRow(row) {
  if (!row) return row;
  const result = { ...row };
  for (const key of ["access_token", "refresh_token"]) {
    if (typeof result[key] === "string" && result[key].startsWith(PREFIX)) {
      result[key] = require("./secretCrypto").decrypt(
        Buffer.from(result[key].slice(PREFIX.length), "base64")
      ).value;
    }
  }
  return result;
}
module.exports = { encode, decodeRow };
