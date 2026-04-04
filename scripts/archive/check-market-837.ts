import { Connection, PublicKey } from "@solana/web3.js";
import { parseAccount, detectLayout } from "../packages/core/src/index.js";

async function main() {
  const conn = new Connection("https://api.devnet.solana.com");
  const slab = new PublicKey("HjBePQZnoZVftg9B52gyeuHGjBvt2f8FNCVP4FeoP3YT");
  const data = await conn.getAccountInfo(slab);
  if (!data) { console.log("Account not found"); process.exit(1); }
  console.log("Data length:", data.data.length);
  try {
    const layout = detectLayout(data.data);
    console.log("Layout:", layout);
    const parsed = parseAccount(data.data);
    if (parsed && parsed.config) {
      console.log("Config keys:", Object.keys(parsed.config));
      for (const [k, v] of Object.entries(parsed.config)) {
        console.log(` ${k}:`, v?.toString?.() ?? v);
      }
    } else {
      console.log("No config found in parsed account");
      console.log("Parsed:", JSON.stringify(parsed, null, 2)?.slice(0, 500));
    }
  } catch(e: any) {
    console.error("Parse error:", e.message);
    console.log("First bytes:", Buffer.from(data.data.slice(0, 100)).toString("hex"));
  }
}
main().catch(console.error);
