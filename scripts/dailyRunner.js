import { runDailySync } from "../server.js";

(async () => {
  try {
    await runDailySync();
    console.log("✅ GitHub Action completed successfully");
  } catch (err) {
    console.error("❌ Sync failed:", err);
    process.exit(1);
  }
})();
