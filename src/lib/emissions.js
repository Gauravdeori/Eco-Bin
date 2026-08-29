/**
 * Fuel and carbon for a collection run.
 *
 * The arithmetic is deliberately spelled out rather than hidden behind one
 * kg-per-km constant, because the answer depends entirely on the vehicle and
 * the operator is the only one who knows theirs. Distance comes from the route,
 * fuel economy from Settings, and the diesel figure below is the only fixed
 * number in the chain.
 */

/**
 * Burning a litre of diesel releases about 2.68 kg of CO₂.
 *
 * This is a property of the fuel — carbon content times the mass ratio of CO₂
 * to carbon — not an efficiency estimate, so it does not vary by vehicle. It is
 * the standard well-to-tank figure used in national greenhouse gas reporting.
 */
export const DIESEL_KG_CO2_PER_LITRE = 2.68;

/**
 * Refuse collection vehicles are heavy and stop constantly, so they are far
 * thirstier than a road lorry. Around 2.5–3 km per litre is typical.
 */
export const DEFAULT_KM_PER_LITRE = 2.8;

/** Fuel burnt and CO₂ released covering `metres`. */
export const emissionsFor = (metres, kmPerLitre = DEFAULT_KM_PER_LITRE) => {
  const km = (metres ?? 0) / 1000;
  const economy = kmPerLitre > 0 ? kmPerLitre : DEFAULT_KM_PER_LITRE;
  const litres = km / economy;
  return { km, litres, co2Kg: litres * DIESEL_KG_CO2_PER_LITRE };
};

/** CO₂ not released, comparing a planned run against an unplanned one. */
export const emissionsSaved = (plannedM, baselineM, kmPerLitre) => {
  const planned = emissionsFor(plannedM, kmPerLitre);
  const baseline = emissionsFor(baselineM, kmPerLitre);
  const co2Kg = baseline.co2Kg - planned.co2Kg;
  return {
    metres: baselineM - plannedM,
    litres: baseline.litres - planned.litres,
    co2Kg,
    percent: baseline.co2Kg > 0 ? Math.round((co2Kg / baseline.co2Kg) * 100) : 0,
  };
};

export const formatCo2 = (kg) => {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return '—';
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  if (Math.abs(kg) >= 10) return `${Math.round(kg)} kg`;
  return `${kg.toFixed(1)} kg`;
};
