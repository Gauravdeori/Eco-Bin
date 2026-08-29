/**
 * Reads dispatch commands from an n8n webhook.
 *
 * EcoBin has no server, so nothing can push into the page. The dashboard polls
 * instead: an n8n Webhook node set to GET, ending in a "Respond to Webhook"
 * node that returns whatever is currently waiting to be dispatched.
 *
 * n8n must send CORS headers for the dashboard's origin, or the browser will
 * refuse the response before this code ever sees it. That failure is reported
 * as its own case below, because "Failed to fetch" on its own sends people
 * looking for a network problem they do not have.
 */

export class N8nError extends Error {
  constructor(message) {
    super(message);
    this.name = 'N8nError';
  }
}

/** Actions that mean "send a truck". Anything else is ignored. */
const DISPATCH_ACTIONS = new Set(['DISPATCH', 'ASSIGN', 'COLLECT', 'FULL']);

/**
 * Pulls the bin reference out of one command.
 *
 * n8n workflows are assembled by hand and the field ends up named whatever the
 * person building it found natural, so the common spellings are all accepted
 * rather than making one arbitrary choice the only correct one.
 */
const binRef = (command) =>
  command.channelId ??
  command.channel_id ??
  command.channel ??
  command.binId ??
  command.bin_id ??
  command.bin ??
  command.id ??
  null;

/**
 * Whether a command is asking for a dispatch.
 *
 * A bare bin reference counts: a workflow that only fires when a bin is full
 * has already made the decision, and demanding it also say so is ceremony.
 */
const wantsDispatch = (command) => {
  const action = String(command.action ?? command.status ?? command.event ?? '')
    .trim()
    .toUpperCase();
  return action === '' || DISPATCH_ACTIONS.has(action);
};

/**
 * A stable identity for a command, so the same one polled twice is acted on
 * once. n8n supplies it if the workflow sets `commandId`; otherwise it is built
 * from the bin and the timestamp, which is enough to tell two real requests
 * apart without letting a repeated poll look like a new one.
 */
const commandId = (command, bin) =>
  String(
    command.commandId ??
      command.command_id ??
      command.uuid ??
      `${bin}@${command.at ?? command.timestamp ?? command.created_at ?? ''}`,
  );

/** Pulls the command list out of whichever shape the workflow returns. */
const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['commands', 'data', 'items', 'results', 'body']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  // A single object is a single command.
  return binRef(payload) ? [payload] : [];
};

/**
 * Fetches whatever n8n currently has waiting.
 * Returns normalised commands; never throws for an empty list.
 */
export const fetchCommands = async (url, { signal } = {}) => {
  if (!url) throw new N8nError('No n8n webhook URL set.');

  let response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new N8nError(
      'Could not reach n8n. If the URL is right, the workflow most likely is not ' +
        'returning CORS headers for this dashboard.',
    );
  }

  if (response.status === 404) {
    throw new N8nError(
      'n8n returned 404. A test webhook only listens while the workflow is open — ' +
        'activate the workflow and use its production URL.',
    );
  }
  if (!response.ok) throw new N8nError(`n8n returned ${response.status}.`);

  const text = await response.text();
  if (!text.trim()) return [];

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new N8nError('n8n returned a response that is not JSON.');
  }

  return asList(payload)
    .filter((command) => command && typeof command === 'object')
    .filter(wantsDispatch)
    .map((command) => {
      const bin = binRef(command);
      return bin === null
        ? null
        : {
            id: commandId(command, bin),
            bin: String(bin),
            truckId: command.truckId ?? command.truck_id ?? command.truck ?? null,
            raw: command,
          };
    })
    .filter(Boolean);
};
