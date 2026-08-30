/**
 * Thin client over the ThingSpeak read API.
 * Docs: https://www.mathworks.com/help/thingspeak/readdata.html
 */

const BASE = 'https://api.thingspeak.com';

export class ThingSpeakError extends Error {
  constructor(message, { channelId, status } = {}) {
    super(message);
    this.name = 'ThingSpeakError';
    this.channelId = channelId;
    this.status = status;
  }
}

const buildUrl = (channelId, { readKey, results }) => {
  const url = new URL(`${BASE}/channels/${encodeURIComponent(channelId)}/feeds.json`);
  url.searchParams.set('results', String(results));
  if (readKey) url.searchParams.set('api_key', readKey);
  return url.toString();
};

/**
 * Reads one channel: its metadata plus the last `results` entries.
 * Rejects with a ThingSpeakError carrying the channel id so a single bad
 * channel can be reported without taking the whole dashboard down.
 */
export const fetchChannelFeed = async (
  { channelId, readKey },
  { results = 100, signal } = {},
) => {
  let response;
  try {
    response = await fetch(buildUrl(channelId, { readKey, results }), {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new ThingSpeakError(
      `Cannot reach ThingSpeak for channel ${channelId}. Check your connection.`,
      { channelId },
    );
  }

  if (response.status === 400 || response.status === 401) {
    throw new ThingSpeakError(
      `Channel ${channelId} refused the read key. Private channels need a valid Read API key.`,
      { channelId, status: response.status },
    );
  }
  if (response.status === 404) {
    throw new ThingSpeakError(`Channel ${channelId} does not exist.`, {
      channelId,
      status: 404,
    });
  }
  if (!response.ok) {
    throw new ThingSpeakError(
      `ThingSpeak returned ${response.status} for channel ${channelId}.`,
      { channelId, status: response.status },
    );
  }

  // A wrong key on a private channel answers 200 with the string "-1".
  const text = await response.text();
  if (text.trim() === '-1') {
    throw new ThingSpeakError(
      `Channel ${channelId} is private — add its Read API key in Settings.`,
      { channelId, status: 200 },
    );
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ThingSpeakError(
      `Channel ${channelId} returned a response that is not JSON.`,
      { channelId },
    );
  }

  return {
    channel: payload.channel ?? { id: channelId },
    feeds: Array.isArray(payload.feeds) ? payload.feeds : [],
  };
};

/** Reads every configured channel in parallel; one failure never blocks the rest. */
export const fetchAllChannels = async (channels, options = {}) => {
  const settled = await Promise.allSettled(
    channels.map((channel) => fetchChannelFeed(channel, options)),
  );

  const results = [];
  const errors = [];

  settled.forEach((outcome, index) => {
    const channel = channels[index];
    if (outcome.status === 'fulfilled') {
      results.push({ ...outcome.value, source: channel });
    } else {
      if (outcome.reason?.name === 'AbortError') return;
      errors.push({
        channelId: channel.channelId,
        message: outcome.reason?.message ?? 'Unknown ThingSpeak error.',
      });
    }
  });

  return { results, errors };
};

/**
 * Folds an incremental fetch into cached history.
 *
 * Polling fast only pays if each poll is small, so steady-state reads ask for
 * the last few entries rather than the whole history. Entries the cache has
 * already seen are dropped by entry id.
 *
 * `gapped` is the honest failure mode of that scheme: when every fetched entry
 * is newer than the cache and the window came back full, entries may have been
 * missed between the two — the caller should refetch the full history rather
 * than quietly serve a hole.
 */
export const mergeFeeds = (cachedFeeds, fetchedFeeds, { limit, window }) => {
  const lastId = cachedFeeds.at(-1)?.entry_id ?? 0;
  const fresh = fetchedFeeds.filter((entry) => entry.entry_id > lastId);
  return {
    feeds: [...cachedFeeds, ...fresh].slice(-limit),
    gapped: cachedFeeds.length > 0 && fetchedFeeds.length >= window && fresh.length === fetchedFeeds.length,
  };
};
