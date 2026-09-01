import { describe, expect, it } from 'vitest';
import { filterDiscoverableEvents } from './discover-events.js';

const events = [
  {
    id: 'one',
    title: 'Friday Rock Night',
    date: '2026-09-04',
    artistName: 'The Example Band',
    venueId: 'venue-one',
    venueName: 'The Crown',
    venueCity: 'Macclesfield',
    geoLat: 53.2587,
    geoLng: -2.1270,
    ticketing: { isTicketed: false },
  },
  {
    id: 'two',
    title: 'Open Mic',
    date: '2026-09-05',
    artistName: 'Various Artists',
    venueId: 'venue-two',
    venueName: 'The Faraway',
    venueCity: 'Manchester',
    geoLat: 53.4808,
    geoLng: -2.2426,
    ticketing: { isTicketed: true, price: '£5' },
    isOpenMic: true,
  },
  {
    id: 'cancelled',
    title: 'Cancelled Show',
    date: '2026-09-03',
    venueId: 'venue-three',
    venueName: 'Old Hall',
    venueCity: 'Macclesfield',
    cancelled: true,
  },
];

describe('filterDiscoverableEvents', () => {
  it('filters canonical events by text, city and admission state', () => {
    const result = filterDiscoverableEvents(events, {
      query: 'example band',
      city: 'Macclesfield',
      ticketed: false,
    });

    expect(result.map((event) => event.id)).toEqual(['one']);
  });

  it('filters open mics independently of free text', () => {
    const result = filterDiscoverableEvents(events, { openMic: true });
    expect(result.map((event) => event.id)).toEqual(['two']);
  });

  it('uses a bounded radius and excludes cancelled events', () => {
    const result = filterDiscoverableEvents(events, {
      latitude: 53.2587,
      longitude: -2.1270,
      radiusMiles: 10,
    });

    expect(result.map((event) => event.id)).toEqual(['one']);
  });
});
