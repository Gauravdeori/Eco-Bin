import React, { useState } from 'react';
import { Plus, Trash, RotateCcw, CheckCircle2, XCircle, Loader2, Radio, Map, ShieldAlert } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { fetchChannelFeed } from '../../services/thingspeak';
import { formatRelative, validCoords } from '../../lib/telemetry';
import { fetchCommands } from '../../services/n8n';
import { SIMULATED_COUNT } from '../../lib/simulation';
import { DIESEL_KG_CO2_PER_LITRE } from '../../lib/emissions';
import { Card, CardHeader, EmptyState, Field, Button, inputClass, cx } from '../ui/Primitives';
import { LocationPicker } from '../settings/LocationPicker';

const FIELD_LABELS = {
  fill: 'Fill level (%)',
  weight: 'Weight (kg)',
  battery: 'Battery (%)',
  lat: 'Latitude',
  lng: 'Longitude',
  temperature: 'Temperature (°C)',
  humidity: 'Humidity (%)',
  category: 'Waste category',
};

const FIELD_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Where the coordinate the map is using actually came from. */
const POSITION_SOURCE = {
  device: 'Position: live GPS from the device',
  manual: 'Position: set here',
  channel: 'Position: from the ThingSpeak channel location',
  none: 'No position — this bin will not appear on the map',
};

const typedCoords = (meta) => Boolean(String(meta.lat ?? '').trim() && String(meta.lng ?? '').trim());

/** Adds a channel after checking it actually answers. */
const AddChannel = ({ onAdd, existing }) => {
  const [channelId, setChannelId] = useState('');
  const [readKey, setReadKey] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' });

  const submit = async (event) => {
    event.preventDefault();
    const id = channelId.trim();
    if (!id) return;

    if (existing.some((channel) => channel.channelId === id)) {
      setState({ status: 'error', message: 'That channel is already connected.' });
      return;
    }

    setState({ status: 'testing', message: '' });
    try {
      const { channel, feeds } = await fetchChannelFeed(
        { channelId: id, readKey: readKey.trim() },
        { results: 1 },
      );
      onAdd({ channelId: id, readKey: readKey.trim() });
      setState({
        status: 'ok',
        message: `Connected to “${channel.name ?? id}” — ${feeds.length ? 'data received' : 'no entries yet'}.`,
      });
      setChannelId('');
      setReadKey('');
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 px-5 pb-5">
      <Field label="Channel ID" hint="The number in your ThingSpeak channel URL.">
        <input
          value={channelId}
          onChange={(event) => setChannelId(event.target.value)}
          placeholder="2345678"
          inputMode="numeric"
          className={inputClass}
        />
      </Field>
      <Field label="Read API key" hint="Only needed for private channels.">
        <input
          value={readKey}
          onChange={(event) => setReadKey(event.target.value)}
          placeholder="Leave blank if public"
          className={inputClass}
        />
      </Field>

      <Button
        variant="primary"
        type="submit"
        disabled={state.status === 'testing' || !channelId.trim()}
        className="w-full py-2.5"
      >
        {state.status === 'testing' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Testing…
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" /> Test &amp; add channel
          </>
        )}
      </Button>

      {state.message && (
        <p
          className={cx(
            'flex items-start gap-1.5 rounded-xl px-3 py-2 text-[11px]',
            state.status === 'ok'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
          )}
        >
          {state.status === 'ok' ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          )}
          {state.message}
        </p>
      )}
    </form>
  );
};

export const SettingsPage = () => {
  const { settings, updateSettings, resetSettings, bins, trucks, linkErrors, lastSync, refresh } =
    useEcoBin();
  const [picking, setPicking] = useState(null);

  const auto = settings.autoDispatch;
  const n8n = settings.n8n;
  const [n8nTest, setN8nTest] = useState(null);

  const patchN8n = (patch) =>
    updateSettings((current) => ({ ...current, n8n: { ...current.n8n, ...patch } }));

  const testN8n = async () => {
    setN8nTest({ state: 'testing' });
    try {
      const commands = await fetchCommands(n8n.url);
      setN8nTest({ state: 'ok', count: commands.length });
    } catch (error) {
      setN8nTest({ state: 'error', message: error.message });
    }
  };
  const patchAuto = (patch) =>
    updateSettings((current) => ({
      ...current,
      autoDispatch: { ...current.autoDispatch, ...patch },
    }));

  const addChannel = (channel) =>
    updateSettings((current) => ({ ...current, channels: [...current.channels, channel] }));

  const removeChannel = (channelId) =>
    updateSettings((current) => ({
      ...current,
      channels: current.channels.filter((channel) => channel.channelId !== channelId),
    }));

  const setMeta = (channelId, patch) =>
    updateSettings((current) => ({
      ...current,
      binMeta: {
        ...current.binMeta,
        [channelId]: { ...(current.binMeta[channelId] ?? {}), ...patch },
      },
    }));

  const errorFor = (channelId) =>
    linkErrors.find((error) => String(error.channelId) === String(channelId));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Connect a bin" subtitle="One ThingSpeak channel per smart bin" />
          <AddChannel onAdd={addChannel} existing={settings.channels} />
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Connected channels"
            subtitle={
              lastSync ? `Last polled ${formatRelative(lastSync)}` : 'Waiting for the first poll'
            }
            action={
              <Button onClick={refresh}>
                <RotateCcw className="h-3.5 w-3.5" /> Poll now
              </Button>
            }
          />

          {settings.channels.length === 0 ? (
            <EmptyState
              icon={Radio}
              title="No channels connected"
              description="Add your first ThingSpeak channel on the left. Everything on the dashboard is built from these feeds."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {settings.channels.map((channel) => {
                const bin = bins.find((item) => item.channelId === channel.channelId);
                const error = errorFor(channel.channelId);
                const meta = settings.binMeta[channel.channelId] ?? {};

                return (
                  <li key={channel.channelId} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        #{channel.channelId}
                      </span>
                      {error ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                          Error
                        </span>
                      ) : bin ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          {bin.readings.length} readings · {formatRelative(bin.lastSeen)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Waiting
                        </span>
                      )}
                      <span className="flex-1" />
                      <Button
                        variant="danger"
                        onClick={() => removeChannel(channel.channelId)}
                        aria-label={`Remove channel ${channel.channelId}`}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {error && (
                      <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                        {error.message}
                      </p>
                    )}

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <input
                        value={meta.label ?? ''}
                        onChange={(event) => setMeta(channel.channelId, { label: event.target.value })}
                        placeholder={bin?.id ?? 'Bin name'}
                        aria-label="Bin name"
                        className={cx(inputClass, 'py-1.5 text-xs')}
                      />
                      <input
                        value={meta.ward ?? ''}
                        onChange={(event) => setMeta(channel.channelId, { ward: event.target.value })}
                        placeholder="Ward"
                        aria-label="Ward"
                        className={cx(inputClass, 'py-1.5 text-xs')}
                      />
                      <input
                        value={meta.location ?? ''}
                        onChange={(event) =>
                          setMeta(channel.channelId, { location: event.target.value })
                        }
                        placeholder="Location / landmark"
                        aria-label="Location"
                        className={cx(inputClass, 'py-1.5 text-xs')}
                      />
                      <input
                        type="number"
                        value={meta.capacityKg ?? ''}
                        onChange={(event) =>
                          setMeta(channel.channelId, { capacityKg: event.target.value })
                        }
                        placeholder="Capacity kg"
                        aria-label="Capacity in kilograms"
                        className={cx(inputClass, 'py-1.5 text-xs')}
                      />
                    </div>

                    {/* Sensor calibration. A depth sensor publishes distance,
                        not fullness, so without these two numbers the reading
                        is taken as a percentage and the bin flickers between
                        empty and full. */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Sensor
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={meta.calibration?.emptyAt ?? ''}
                        onChange={(event) =>
                          setMeta(channel.channelId, {
                            calibration: {
                              ...(meta.calibration ?? {}),
                              emptyAt: event.target.value,
                            },
                          })
                        }
                        placeholder="Reading when empty"
                        aria-label="Raw sensor reading with the bin empty"
                        className={cx(inputClass, 'w-40 py-1.5 text-xs')}
                      />
                      <input
                        type="number"
                        step="any"
                        value={meta.calibration?.fullAt ?? ''}
                        onChange={(event) =>
                          setMeta(channel.channelId, {
                            calibration: {
                              ...(meta.calibration ?? {}),
                              fullAt: event.target.value,
                            },
                          })
                        }
                        placeholder="Reading when full"
                        aria-label="Raw sensor reading with the bin full"
                        className={cx(inputClass, 'w-40 py-1.5 text-xs')}
                      />
                      <span className="text-[10px] text-slate-400">
                        Leave blank if the device already sends a percentage
                      </span>
                    </div>

                    {/* Position is always editable: a bin that sits in the
                        wrong place needs correcting, not just filling in. */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        value={meta.lat ?? ''}
                        onChange={(event) => setMeta(channel.channelId, { lat: event.target.value })}
                        placeholder="Latitude"
                        inputMode="decimal"
                        aria-label="Latitude"
                        className={cx(inputClass, 'w-32 py-1.5 text-xs')}
                      />
                      <input
                        value={meta.lng ?? ''}
                        onChange={(event) => setMeta(channel.channelId, { lng: event.target.value })}
                        placeholder="Longitude"
                        inputMode="decimal"
                        aria-label="Longitude"
                        className={cx(inputClass, 'w-32 py-1.5 text-xs')}
                      />

                      <Button onClick={() => setPicking(channel.channelId)}>
                        <Map className="h-3.5 w-3.5" /> Set on map
                      </Button>

                      {typedCoords(meta) && !validCoords(Number(meta.lat), Number(meta.lng)) ? (
                        <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                          Not a valid coordinate
                        </span>
                      ) : bin?.positionWarning ? (
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          {bin.positionWarning}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {POSITION_SOURCE[bin?.positionSource] ?? POSITION_SOURCE.none}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Field mapping"
            subtitle="Which ThingSpeak field carries which measurement"
          />
          <div className="space-y-2 px-5 pb-5">
            {Object.entries(FIELD_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-300">{label}</span>
                <select
                  value={settings.fieldMap[key]}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      fieldMap: { ...current.fieldMap, [key]: Number(event.target.value) },
                    }))
                  }
                  aria-label={`Field for ${label}`}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {FIELD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 0 ? 'Not sent' : `field${option}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Collection runs"
            subtitle="Where trucks start from, and what the CO₂ figures assume"
          />
          <div className="space-y-3 px-5 pb-5">
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <input
                type="checkbox"
                checked={settings.simulation?.enabled ?? false}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    simulation: { ...current.simulation, enabled: event.target.checked },
                  }))
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-900 dark:text-white">
                  Include {SIMULATED_COUNT} simulated bins
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                  Demo bins around the map centre, so routing and ranking have something to work
                  with before the hardware is live. They are badged SIM everywhere and sit
                  alongside your real channels. Turn this off for a production dashboard.
                </span>
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Depot latitude" hint="Blank uses the map centre.">
                <input
                  type="number"
                  step="0.00001"
                  value={settings.depot?.lat ?? ''}
                  placeholder={String(settings.mapCenter.lat)}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      depot: {
                        ...current.depot,
                        lat: event.target.value === '' ? null : Number(event.target.value),
                      },
                    }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Depot longitude" hint="Runs start and end here.">
                <input
                  type="number"
                  step="0.00001"
                  value={settings.depot?.lng ?? ''}
                  placeholder={String(settings.mapCenter.lng)}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      depot: {
                        ...current.depot,
                        lng: event.target.value === '' ? null : Number(event.target.value),
                      },
                    }))
                  }
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label={`Simulated driving speed: ${settings.simulation?.speed ?? 20}x real time`}
              hint="A real round takes most of an hour. Distances, ordering and fuel are real; only the playback is sped up."
            >
              <input
                type="range"
                min="1"
                max="120"
                step="1"
                value={settings.simulation?.speed ?? 20}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    simulation: { ...current.simulation, speed: Number(event.target.value) },
                  }))
                }
                className="w-full text-emerald-600"
              />
            </Field>

            <Field
              label="Truck fuel economy (km per litre)"
              hint={`Refuse trucks manage roughly 2.5–3. Diesel releases ${DIESEL_KG_CO2_PER_LITRE} kg CO₂ per litre burnt.`}
            >
              <input
                type="number"
                min="0.5"
                max="20"
                step="0.1"
                value={settings.fleet?.kmPerLitre ?? ''}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    fleet: { ...current.fleet, kmPerLitre: Number(event.target.value) || 2.8 },
                  }))
                }
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="n8n dispatch control"
            subtitle="Hand the decision to send a truck to a workflow"
          />
          <div className="space-y-3 px-5 pb-5">
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              EcoBin has no server, so n8n cannot push to it. Point this at an n8n
              <b> Webhook</b> node set to GET, ending in <b>Respond to Webhook</b>, and the
              dashboard will ask it what to dispatch. The workflow has to send CORS headers
              for this page&apos;s address.
            </p>

            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <input
                type="checkbox"
                checked={n8n?.enabled ?? false}
                onChange={(event) => patchN8n({ enabled: event.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-900 dark:text-white">
                  Take dispatch commands from n8n
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                  Polled every {n8n?.pollSeconds ?? 10}s. A command is acted on once, so a
                  webhook that keeps returning the same row will not send the same truck twice.
                </span>
              </span>
            </label>

            <Field
              label="Webhook URL"
              hint="The production URL. A test webhook only listens while the workflow is open."
            >
              <input
                value={n8n?.url ?? ''}
                onChange={(event) => patchN8n({ url: event.target.value.trim() })}
                placeholder="https://your-n8n/webhook/ecobin-dispatch"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Poll interval (seconds)">
                <input
                  type="number"
                  min="3"
                  max="300"
                  value={n8n?.pollSeconds ?? 10}
                  onChange={(event) =>
                    patchN8n({ pollSeconds: Math.max(3, Number(event.target.value) || 10) })
                  }
                  className={inputClass}
                />
              </Field>
              <div className="flex items-end">
                <Button onClick={testN8n} disabled={!n8n?.url || n8nTest?.state === 'testing'}>
                  {n8nTest?.state === 'testing' ? 'Testing…' : 'Test connection'}
                </Button>
              </div>
            </div>

            {n8nTest?.state === 'ok' && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                Reached the workflow. {n8nTest.count} command
                {n8nTest.count === 1 ? '' : 's'} waiting.
              </p>
            )}
            {n8nTest?.state === 'error' && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                {n8nTest.message}
              </p>
            )}

            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <input
                type="checkbox"
                checked={n8n?.lockManual ?? true}
                disabled={!n8n?.enabled}
                onChange={(event) => patchN8n({ lockManual: event.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600 disabled:opacity-40"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-900 dark:text-white">
                  Stop the dispatch buttons working by hand
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                  The buttons read &ldquo;Waiting on n8n&rdquo; and do nothing until the workflow
                  asks. Cancelling a dispatch stays manual, so an operator can always call a
                  truck back.
                </span>
              </span>
            </label>

            <p className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Respond with, e.g.
              <br />
              {'[{ "channelId": "2345678", "action": "DISPATCH",'}
              <br />
              {'   "commandId": "{{ $execution.id }}" }]'}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Auto-dispatch"
            subtitle="Let the dashboard send trucks without being asked"
          />
          <div className="space-y-3 px-5 pb-5">
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <input
                type="checkbox"
                checked={auto.enabled}
                onChange={(event) => patchAuto({ enabled: event.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-900 dark:text-white">
                  Assign trucks automatically
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                  A bin is dispatched only when it is both urgent enough and actually needs
                  emptying. Silent bins and flat batteries raise alerts, never trucks.
                </span>
              </span>
            </label>

            <Field
              label={`Dispatch at priority ${auto.minScore} and above${
                auto.minScore >= 60
                  ? ` (about ${Math.round(
                      settings.thresholds.full +
                        ((auto.minScore - 60) / 20) * (100 - settings.thresholds.full),
                    )}% full)`
                  : ' (before a bin is even full)'
              }`}
              hint={`A bin scores 60 the moment it reaches your ${settings.thresholds.full}% full threshold. Above that it climbs with how far past full it is, and with reports, weight and how fast it is filling.`}
            >
              <input
                type="range"
                min="40"
                max="95"
                value={auto.minScore}
                disabled={!auto.enabled}
                onChange={(event) => patchAuto({ minScore: Number(event.target.value) })}
                className="w-full text-emerald-600 disabled:opacity-40"
              />
            </Field>

            <Field
              label="Pause after a cancelled dispatch (minutes)"
              hint="Calling off a truck holds that bin back, so auto-dispatch does not overrule you."
            >
              <input
                type="number"
                min="0"
                max="1440"
                value={auto.cooldownMinutes}
                disabled={!auto.enabled}
                onChange={(event) =>
                  patchAuto({ cooldownMinutes: Math.max(0, Number(event.target.value) || 0) })
                }
                className={cx(inputClass, 'disabled:opacity-40')}
              />
            </Field>

            {auto.enabled && trucks.length === 0 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                No trucks in the fleet yet — add one on the Trucks page or nothing can be
                dispatched.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Thresholds & polling" subtitle="How the dashboard reads your data" />
          <div className="space-y-3 px-5 pb-5">
            <Field label={`Full at ${settings.thresholds.full}%`}>
              <input
                type="range"
                min="50"
                max="100"
                value={settings.thresholds.full}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    thresholds: { ...current.thresholds, full: Number(event.target.value) },
                  }))
                }
                className="w-full text-emerald-600"
              />
            </Field>
            <Field label={`Filling at ${settings.thresholds.filling}%`}>
              <input
                type="range"
                min="10"
                max={settings.thresholds.full - 1}
                value={settings.thresholds.filling}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    thresholds: { ...current.thresholds, filling: Number(event.target.value) },
                  }))
                }
                className="w-full text-amber-500"
              />
            </Field>
            <Field
              label="Poll interval (seconds)"
              hint="Small delta reads run every few seconds regardless; this sets the full re-sync cadence. Above 30s it is honoured as-is."
            >
              <input
                type="number"
                min="10"
                max="600"
                value={settings.pollSeconds}
                onChange={(event) =>
                  updateSettings({ pollSeconds: Math.max(10, Number(event.target.value) || 15) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="History points per channel" hint="Up to 8000. Higher means slower polls.">
              <input
                type="number"
                min="10"
                max="8000"
                value={settings.historyPoints}
                onChange={(event) =>
                  updateSettings({ historyPoints: Math.max(10, Number(event.target.value) || 100) })
                }
                className={inputClass}
              />
            </Field>
            <Field
              label={`Collection detected on a ${settings.collectionDropPercent}% drop`}
              hint="How far the fill level must fall between two readings to count as a pickup."
            >
              <input
                type="range"
                min="10"
                max="80"
                value={settings.collectionDropPercent}
                onChange={(event) =>
                  updateSettings({ collectionDropPercent: Number(event.target.value) })
                }
                className="w-full text-emerald-600"
              />
            </Field>

            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <Field
                label="OpenRouteService API key"
                hint="Optional. Powers address search in the location picker and the driving route between bins. Map tiles never need a key."
              >
                <input
                  value={settings.orsKey}
                  onChange={(event) => updateSettings({ orsKey: event.target.value.trim() })}
                  placeholder="Paste your ORS key"
                  className={inputClass}
                />
              </Field>

              {settings.orsKey && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                  This is a browser app, so the key is readable by anyone who opens the site.
                  Rotate it at openrouteservice.org if the quota gets abused.
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <Button variant="danger" onClick={resetSettings} className="w-full py-2.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reset all settings
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {picking && (
        <LocationPicker
          binLabel={
            bins.find((bin) => bin.channelId === picking)?.id ?? `channel #${picking}`
          }
          lat={settings.binMeta[picking]?.lat}
          lng={settings.binMeta[picking]?.lng}
          onClose={() => setPicking(null)}
          onSave={(lat, lng) => {
            setMeta(picking, { lat, lng });
            setPicking(null);
          }}
        />
      )}
    </div>
  );
};
