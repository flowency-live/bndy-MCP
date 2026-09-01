// Read-only canonical discovery for Ask bndy and other MCP clients.

import { apiRequest } from '../utils/http-client.js';

export interface DiscoverEventsParams {
  startDate?: string;
  endDate?: string;
  query?: string;
  city?: string;
  ticketed?: boolean;
  openMic?: boolean;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number;
  limit?: number;
}

interface PublicEvent {
  id: string;
  title?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  artistId?: string;
  artistName?: string;
  artistIds?: string[];
  artistNames?: string[];
  venueId: string;
  venueName?: string;
  venueCity?: string;
  venue?: { city?: string };
  geoLat?: number;
  geoLng?: number;
  ticketed?: boolean;
  ticketing?: {
    isTicketed: boolean;
    price?: string;
    ticketUrl?: string;
    ticketInformation?: string;
  };
  price?: string;
  isOpenMic?: boolean;
  type?: string;
  cancelled?: boolean;
}

interface PublicEventsResponse {
  events?: PublicEvent[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WINDOW_DAYS = 92;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateDistanceDays(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000,
  );
}

function normalise(value?: string): string {
  return value?.trim().toLocaleLowerCase('en-GB') ?? '';
}

function isOpenMic(event: PublicEvent): boolean {
  return event.isOpenMic === true || event.type === 'open-mic';
}

function isTicketed(event: PublicEvent): boolean {
  return event.ticketing?.isTicketed ?? event.ticketed === true;
}

function distanceMiles(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = radians(toLat - fromLat);
  const dLng = radians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function filterDiscoverableEvents(
  events: PublicEvent[],
  params: DiscoverEventsParams,
): PublicEvent[] {
  const query = normalise(params.query);
  const city = normalise(params.city);
  const hasRadius =
    typeof params.latitude === 'number' &&
    typeof params.longitude === 'number' &&
    typeof params.radiusMiles === 'number';

  return events
    .filter((event) => event.cancelled !== true)
    .filter((event) => {
      if (!query) return true;
      const haystack = normalise([
        event.title,
        event.artistName,
        ...(event.artistNames ?? []),
        event.venueName,
        event.venueCity,
        event.venue?.city,
      ].filter(Boolean).join(' '));
      return haystack.includes(query);
    })
    .filter((event) => {
      if (!city) return true;
      return normalise(event.venueCity ?? event.venue?.city).includes(city);
    })
    .filter((event) => params.ticketed === undefined || isTicketed(event) === params.ticketed)
    .filter((event) => params.openMic === undefined || isOpenMic(event) === params.openMic)
    .filter((event) => {
      if (!hasRadius) return true;
      if (typeof event.geoLat !== 'number' || typeof event.geoLng !== 'number') return false;
      return distanceMiles(
        params.latitude as number,
        params.longitude as number,
        event.geoLat,
        event.geoLng,
      ) <= (params.radiusMiles as number);
    })
    .sort((a, b) => `${a.date}${a.startTime ?? ''}`.localeCompare(`${b.date}${b.startTime ?? ''}`));
}

function validate(params: DiscoverEventsParams, startDate: string, endDate: string): string | null {
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    return 'startDate and endDate must use YYYY-MM-DD';
  }
  const days = dateDistanceDays(startDate, endDate);
  if (days < 0) return 'endDate must not be before startDate';
  if (days > MAX_WINDOW_DAYS) return `date window must not exceed ${MAX_WINDOW_DAYS} days`;

  const coordinateCount = [params.latitude, params.longitude, params.radiusMiles]
    .filter((value) => value !== undefined).length;
  if (coordinateCount !== 0 && coordinateCount !== 3) {
    return 'latitude, longitude and radiusMiles must be supplied together';
  }
  if (params.latitude !== undefined && (params.latitude < -90 || params.latitude > 90)) {
    return 'latitude must be between -90 and 90';
  }
  if (params.longitude !== undefined && (params.longitude < -180 || params.longitude > 180)) {
    return 'longitude must be between -180 and 180';
  }
  if (params.radiusMiles !== undefined && (params.radiusMiles <= 0 || params.radiusMiles > 100)) {
    return 'radiusMiles must be greater than 0 and no more than 100';
  }
  return null;
}

export async function discoverEvents(params: DiscoverEventsParams): Promise<string> {
  const startDate = params.startDate ?? todayIso();
  const endDate = params.endDate ?? addDays(startDate, 30);
  const error = validate(params, startDate, endDate);

  if (error) {
    return JSON.stringify({ found: false, grounded: true, source: 'canonical-bndy', error }, null, 2);
  }

  const requestedLimit = Number.isFinite(params.limit) ? Math.trunc(params.limit as number) : DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(requestedLimit, MAX_LIMIT));
  const query = new URLSearchParams({ startDate, endDate });

  try {
    const response = await apiRequest<PublicEventsResponse>(`/api/events/public?${query}`, 'GET');
    const matched = filterDiscoverableEvents(response.events ?? [], params);
    const events = matched.slice(0, limit).map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      artistId: event.artistId,
      artistName: event.artistName,
      artistIds: event.artistIds,
      artistNames: event.artistNames,
      venueId: event.venueId,
      venueName: event.venueName,
      venueCity: event.venueCity ?? event.venue?.city,
      latitude: event.geoLat,
      longitude: event.geoLng,
      ticketed: isTicketed(event),
      price: event.ticketing?.price ?? event.price,
      ticketUrl: event.ticketing?.ticketUrl,
      openMic: isOpenMic(event),
      bndyUrl: `https://bndy.live/gigs/${event.id}`,
      distanceMiles:
        typeof params.latitude === 'number' &&
        typeof params.longitude === 'number' &&
        typeof event.geoLat === 'number' &&
        typeof event.geoLng === 'number'
          ? Number(distanceMiles(params.latitude, params.longitude, event.geoLat, event.geoLng).toFixed(1))
          : undefined,
    }));

    return JSON.stringify({
      found: events.length > 0,
      grounded: true,
      source: 'canonical-bndy',
      count: events.length,
      totalMatched: matched.length,
      truncated: matched.length > events.length,
      appliedFilters: {
        startDate,
        endDate,
        query: params.query,
        city: params.city,
        ticketed: params.ticketed,
        openMic: params.openMic,
        latitude: params.latitude,
        longitude: params.longitude,
        radiusMiles: params.radiusMiles,
      },
      events,
      message: events.length > 0
        ? `Found ${events.length} canonical BNDY event(s)`
        : 'No canonical BNDY events matched these filters',
    }, null, 2);
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Unknown error';
    console.error('[discover_events] Error:', cause);
    return JSON.stringify({
      found: false,
      grounded: true,
      source: 'canonical-bndy',
      error: message,
      message: 'Failed to query canonical BNDY events',
    }, null, 2);
  }
}
