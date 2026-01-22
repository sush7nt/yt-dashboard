import "../server.js";
import fetch from "node-fetch";

async function run() {
  try {
    const res = await fetch("http://localhost:3000/history");
    const data = await res.json();
    console.log("✅ Daily sync completed:", data);
    process.exit(0);
  } catch (err) {
    console.error("❌ Sync failed:", err);
    process.exit(1);
  }
}

run();
