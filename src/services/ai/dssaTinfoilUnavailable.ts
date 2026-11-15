// Windows redistribution deliberately excludes the optional AGPL SDK.
const message =
  "Tinfoil er ikke med i denne Windows-utgaven. Velg lokal modell eller en annen leverandør.";
export class TinfoilAI {
  constructor() {
    throw new Error(message);
  }
}
export class SecureClient {
  constructor() {
    throw new Error(message);
  }
}
export function createTinfoilAI(): never {
  throw new Error(message);
}
