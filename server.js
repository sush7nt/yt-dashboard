import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = 3000;

/* ---------------- AUTH ---------------- */

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

/* ---------------- SUPABASE ---------------- */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/* ---------------- HELPERS ---------------- */

function parseDuration(duration) {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const h = match[1] ? parseInt(match[1]) : 0;
  const m = match[2] ? parseInt(match[2]) : 0;
  const s = match[3] ? parseInt(match[3]) : 0;
  return h * 3600 + m * 60 + s;
}

function classify(title, channel) {
  const keywords = [
    "tutorial",
    "learn",
    "course",
    "how to",
    "coding",
    "programming",
    "ai",
    "startup",
    "business",
    "finance",
  ];

  const text = (title + channel).toLowerCase();
  return keywords.some(k => text.includes(k))
    ? "education"
    : "entertainment";
}

/* ---------------- MAIN ROUTE ---------------- */

app.get("/history", async (req, res) => {
  try {
    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client,
    });

    // 1️⃣ Get last sync time
    const { data: state } = await supabase
      .from("sync_state")
      .select("last_synced_at")
      .eq("id", 1)
      .single();

    const lastSync = new Date(state.last_synced_at);

    // 2️⃣ Fetch ALL liked videos (pagination)
    let allItems = [];
    let nextPageToken = null;

    do {
      const response = await youtube.playlistItems.list({
        part: "snippet",
        playlistId: "LL",
        maxResults: 50,
        pageToken: nextPageToken,
      });

      allItems.push(...response.data.items);
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);

    // 3️⃣ Get video details
    const videoIds = allItems.map(
      v => v.snippet.resourceId.videoId
    );

    const details = await youtube.videos.list({
      part: "snippet,contentDetails",
      id: videoIds.join(","),
    });

    // 4️⃣ Prepare rows
    const rows = details.data.items.map(v => ({
      video_id: v.id,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      duration: parseDuration(v.contentDetails.duration),
      type: classify(v.snippet.title, v.snippet.channelTitle),
      video_url: `https://www.youtube.com/watch?v=${v.id}`,
    }));

    // 5️⃣ Insert into Supabase
    const { error } = await supabase
      .from("youtube_history")
      .insert(rows);

    if (error) throw error;

    // 6️⃣ Update sync timestamp
    await supabase
      .from("sync_state")
      .update({ last_synced_at: new Date() })
      .eq("id", 1);

    res.json({
      success: true,
      inserted: rows.length,
    });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- SERVER ---------------- */

if (process.env.RUN_MODE !== "github") {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

