import { YoutubeTranscript } from "youtube-transcript";
import { log } from "evlog";

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
    /(?:youtu\.be\/)([^?\s]+)/,
    /(?:youtube\.com\/embed\/)([^?\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function fetchYouTubeTranscript(url: string): Promise<string | null> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  try {
    // Prefer English transcript; fall back to any available language
    let transcript;
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    } catch (error) {
      log.info({ event: "youtube.transcript.language_fallback",
        videoId,
        error,
      });
      transcript = await YoutubeTranscript.fetchTranscript(videoId);
    }
    return transcript.map((entry) => entry.text).join(" ");
  } catch (error) {
    log.warn({ event: "youtube.transcript.failed", videoId, error });
    return null;
  }
}
