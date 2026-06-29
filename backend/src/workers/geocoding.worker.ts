import { Worker, Job } from 'bullmq';
import { getQueueRedisOptions } from '../config/redis';
import { query, queryOne } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';

interface GeoJobData {
  patient_address?:    string;
  referral_id?:        string;
  practitioner_id?:    string;
  address?:            string;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${env.GOOGLE_MAPS_API_KEY}`;
  const res  = await fetch(url);
  const data = await res.json() as {
    status:  string;
    results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
  };

  if (data.status !== 'OK' || !data.results[0]) {
    logger.warn({ address, status: data.status }, 'Geocoding failed');
    return null;
  }

  return data.results[0].geometry.location;
}

export async function geocodePatient(referralId: string, address: string): Promise<void> {
  const coords = await geocodeAddress(address);
  if (!coords) return;

  // Get patient_id from referral
  const [referral] = await query<{ patient_id: string }>(
    'SELECT patient_id FROM referrals WHERE id = $1',
    [referralId],
  );
  if (!referral) return;

  const postgisExists = await queryOne<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')"
  ).then(r => !!r?.exists).catch(() => false);

  if (postgisExists) {
    await query(
      `UPDATE patients SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
      [coords.lng, coords.lat, referral.patient_id],
    );
  } else {
    await query(
      `UPDATE patients SET location = $1 WHERE id = $2`,
      [`POINT(${coords.lng} ${coords.lat})`, referral.patient_id],
    );
  }

  logger.debug({ referralId, lat: coords.lat, lng: coords.lng }, 'Patient geocoded');
}

export async function geocodePractitioner(practitionerId: string, address: string): Promise<void> {
  const coords = await geocodeAddress(address);
  if (!coords) return;

  const postgisExists = await queryOne<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')"
  ).then(r => !!r?.exists).catch(() => false);

  if (postgisExists) {
    await query(
      `UPDATE practitioner_profiles
       SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       WHERE practitioner_id = $3`,
      [coords.lng, coords.lat, practitionerId],
    );
  } else {
    await query(
      `UPDATE practitioner_profiles
       SET location = $1
       WHERE practitioner_id = $2`,
      [`POINT(${coords.lng} ${coords.lat})`, practitionerId],
    );
  }

  logger.debug({ practitionerId, lat: coords.lat, lng: coords.lng }, 'Practitioner geocoded');
}

export async function executeGeocodingJob(name: string, data: any): Promise<void> {
  if (name === 'geocode-patient' && data.referral_id && data.patient_address) {
    await geocodePatient(data.referral_id, data.patient_address);
  } else if (name === 'geocode-practitioner' && data.practitioner_id && data.address) {
    await geocodePractitioner(data.practitioner_id, data.address);
  }
}

export function startGeocodingWorker() {
  const worker = new Worker<GeoJobData>('geocoding', async (job: Job<GeoJobData>) => {
    await executeGeocodingJob(job.name, job.data);
  }, {
    connection: getQueueRedisOptions(),
    concurrency: 5,
    limiter: { max: 50, duration: 1000 }, // Google Maps rate limit
  });

  worker.on('failed', (job, err) => {
    logger.error({ job: job?.name, jobId: job?.id, err }, 'Geocoding worker job failed');
  });

  return worker;
}
