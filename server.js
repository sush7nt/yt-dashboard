import { google } from "googleapis";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

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
    "tutorial", "learn", "course", "how to",
    "coding", "programming", "ai",
    "startup", "business", "finance"
  ];

  const text = (title + channel).toLowerCase();
  return keywords.some(k => text.includes(k))
    ? "education"
    : "entertainment";
}

/* ---------------- MAIN LOGIC ---------------- */

export async function runDailySync() {
  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  // Get last sync time
  const { data: state } = await supabase
    .from("sync_state")
    .select("last_synced_at")
    .eq("id", 1)
    .single();

  let allItems = [];
  let nextPageToken = null;

  // Fetch ALL liked videos
  do {
    const res = await youtube.playlistItems.list({
      part: "snippet",
      playlistId: "LL",
      maxResults: 50,
      pageToken: nextPageToken,
    });

    allItems.push(...res.data.items);
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  const videoIds = allItems.map(v =>
    v.snippet.resourceId.videoId
  );

  const details = await youtube.videos.list({
    part: "snippet,contentDetails",
    id: videoIds.join(","),
  });

  const rows = details.data.items.map(v => ({
    video_id: v.id,
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    duration: parseDuration(v.contentDetails.duration),
    type: classify(v.snippet.title, v.snippet.channelTitle),
    video_url: `https://www.youtube.com/watch?v=${v.id}`,
  }));

  const { error } = await supabase
    .from("youtube_history")
    .insert(rows);

  if (error) throw error;

  await supabase
    .from("sync_state")
    .update({ last_synced_at: new Date() })
    .eq("id", 1);

  console.log("✅ Daily YouTube sync completed");
}
