export type RideStop = {
  id: string;
  address: string;
  lat: number;
  lng: number;
};

export function normalizeRideStops(value: unknown): RideStop[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return [];
    }

    return [{
      id: String(item?.id || `stop-${index + 1}`),
      address: String(item?.address || `Stop ${index + 1}`).trim(),
      lat,
      lng,
    }];
  });
}

export function encodeStopsQuery(stops: RideStop[]) {
  return stops.map((stop) => `${stop.lat},${stop.lng}`).join("|");
}
