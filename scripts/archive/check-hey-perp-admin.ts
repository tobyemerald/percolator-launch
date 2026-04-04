import { Connection, PublicKey } from "@solana/web3.js";
import { parseHeader, parseConfig, detectSlabLayout } from "../packages/core/src/index.js";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const SLAB = new PublicKey("FrzyATwi84ecScxXseSCmiEBP1pVmQ6zsrm7kqyJTo5C");

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  if (!info) { console.log("Not found"); return; }
  const d = info.data;
  console.log("Total bytes:", d.length);

  const header = parseHeader(d);
  console.log("admin:            ", header.admin.toBase58());
  console.log("resolved:         ", header.resolved);
  console.log("paused:           ", header.paused);

  const layout = detectSlabLayout(d);
  console.log("layout:           ", layout?.version ?? "V0");
  
  const config = parseConfig(d, layout ?? undefined);
  console.log("oracle_authority: ", config.oracleAuthority.toBase58());
  console.log("collateral_mint:  ", config.collateralMint.toBase58());
}
main().catch(console.error);
