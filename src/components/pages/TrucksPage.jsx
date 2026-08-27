import React, { useState } from 'react';
import { Truck, Plus, Trash } from 'lucide-react';
import { useEcoBin } from '../../context/EcoBinContext';
import { TrucksPanel } from '../dashboard/TrucksPanel';
import { Card, CardHeader, EmptyState, Field, Button, inputClass, cx } from '../ui/Primitives';

const STATUS_OPTIONS = [
  { value: 'IDLE', label: 'Idle' },
  { value: 'ON_ROUTE', label: 'On Route' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
];

export const TrucksPage = () => {
  const { trucks, addTruck, removeTruck, setTruckStatus, assignments, bins } = useEcoBin();
  const [form, setForm] = useState({ id: '', driver: '', capacityKg: '' });

  const submit = (event) => {
    event.preventDefault();
    addTruck(form);
    setForm({ id: '', driver: '', capacityKg: '' });
  };

  const targetFor = (truckId) => {
    const entry = Object.entries(assignments).find(([, value]) => value.truckId === truckId);
    if (!entry) return null;
    return bins.find((bin) => bin.channelId === entry[0]) ?? null;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Add a truck" subtitle="Your fleet, stored on this device" />
          <form onSubmit={submit} className="space-y-3 px-5 pb-5">
            <Field label="Truck ID" hint="Leave blank to auto-number (TR-01, TR-02…)">
              <input
                value={form.id}
                onChange={(event) => setForm({ ...form, id: event.target.value })}
                placeholder="TR-08"
                className={inputClass}
              />
            </Field>
            <Field label="Driver">
              <input
                value={form.driver}
                onChange={(event) => setForm({ ...form, driver: event.target.value })}
                placeholder="Driver name"
                className={inputClass}
              />
            </Field>
            <Field label="Capacity (kg)">
              <input
                type="number"
                min="0"
                value={form.capacityKg}
                onChange={(event) => setForm({ ...form, capacityKg: event.target.value })}
                placeholder="800"
                className={inputClass}
              />
            </Field>
            <Button variant="primary" type="submit" className="w-full py-2.5">
              <Plus className="h-4 w-4" /> Add truck
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Fleet"
            subtitle={`${trucks.length} vehicle${trucks.length === 1 ? '' : 's'}`}
          />
          {trucks.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No trucks yet"
              description="Add your collection vehicles so full bins can be dispatched to a driver from the dashboard."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left">
                <thead>
                  <tr className="border-y border-slate-100 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-2.5 font-bold">Truck</th>
                    <th className="px-3 py-2.5 font-bold">Driver</th>
                    <th className="px-3 py-2.5 font-bold">Current stop</th>
                    <th className="px-3 py-2.5 font-bold">Status</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                  {trucks.map((truck) => {
                    const target = targetFor(truck.id);
                    return (
                      <tr key={truck.id}>
                        <td className="px-5 py-3">
                          <p className="font-bold text-slate-900 dark:text-white">{truck.id}</p>
                          {truck.capacityKg && (
                            <p className="text-[11px] text-slate-500 tabular dark:text-slate-400">
                              {truck.capacityKg} kg
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                          {truck.driver}
                        </td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                          {target ? (
                            <span>
                              {target.id}
                              <span className="block text-[11px] text-slate-400">
                                {target.location}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={truck.status}
                            onChange={(event) => setTruckStatus(truck.id, event.target.value)}
                            aria-label={`Status for ${truck.id}`}
                            className={cx(
                              'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold',
                              'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                            )}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="danger"
                            onClick={() => removeTruck(truck.id)}
                            aria-label={`Remove ${truck.id}`}
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <TrucksPanel />
    </div>
  );
};
