import React, { useState } from 'react';
import { Plus, Trash, RotateCcw, CheckCircle2, XCircle, Loader2, Radio } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { fetchChannelFeed } from '../../services/thingspeak';
import { formatRelative, validCoords } from '../../lib/telemetry';
import { Card, CardHeader, EmptyState, Field, Button, inputClass, cx } from '../ui/Primitives';

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
  const { settings, updateSettings, resetSettings, bins, linkErrors, lastSync, refresh } =
    useEcoBin();

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

                      {typedCoords(meta) && !validCoords(Number(meta.lat), Number(meta.lng)) ? (
                        <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                          Not a valid coordinate
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
              hint="ThingSpeak's free tier updates at most every 15 seconds."
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
              <Button variant="danger" onClick={resetSettings} className="w-full py-2.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reset all settings
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
