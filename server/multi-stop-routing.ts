type Coordinate = { lat: number; lng: number };

export function buildOsrmRouteUrl(
  origin: Coordinate,
  destination: Coordinate,
  stops: Coordinate[] = [],
  alternatives = false,
) {
  const coordinates = [origin, ...stops, destination]
    .map((point) => `${point.lng},${point.lat}`)
    .join(";");
  return `https://router.project-osrm.org/route/v1/driving/${coordinates}` +
    `?overview=full&geometries=polyline&steps=true&alternatives=${alternatives ? "true" : "false"}`;
}

export function parseOsrmRoutes(data: any) {
  if (data?.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error(data?.message || data?.code || "No route found");
  }

  return data.routes.map((route: any, index: number) => {
    const legs = Array.isArray(route?.legs) ? route.legs : [];
    const distanceKm = Number(route?.distance || 0) / 1000;
    const durationMin = Math.ceil(Number(route?.duration || 0) / 60);
    const steps = legs.flatMap((leg: any) => (leg?.steps || []).map((step: any) => {
      const maneuver = step?.maneuver || {};
      const action = [maneuver.type, maneuver.modifier]
        .filter(Boolean)
        .join(" ")
        .replace(/\b\w/g, (letter: string) => letter.toUpperCase());
      return {
        instruction: [action, step?.name ? `onto ${step.name}` : ""].filter(Boolean).join(" "),
        distance: `${(Number(step?.distance || 0) / 1000).toFixed(1)} km`,
        duration: `${Math.ceil(Number(step?.duration || 0) / 60)} min`,
        endLat: maneuver?.location?.[1],
        endLng: maneuver?.location?.[0],
        maneuver: maneuver?.type || "straight",
      };
    }));

    return {
      polyline: String(route?.geometry || ""),
      distanceKm,
      distanceText: `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)} km`,
      durationMin,
      durationText: `${durationMin} min`,
      summary: legs.map((leg: any) => leg?.summary).filter(Boolean).join(", ") || `Route ${index + 1}`,
      steps,
    };
  });
}

function decodePolyline(encoded: string): Coordinate[] {
  const points: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function encodeSigned(value: number) {
  let encoded = value < 0 ? ~(value << 1) : value << 1;
  let output = "";
  while (encoded >= 0x20) {
    output += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63);
    encoded >>= 5;
  }
  return output + String.fromCharCode(encoded + 63);
}

function encodePolyline(points: Coordinate[]) {
  let previousLat = 0;
  let previousLng = 0;
  return points.map((point) => {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    const encoded = encodeSigned(lat - previousLat) + encodeSigned(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
    return encoded;
  }).join("");
}

export function combineDirectionSegments(segments: any[]) {
  const coordinates = segments.flatMap((segment, index) => {
    const decoded = decodePolyline(String(segment.polyline || ""));
    return index > 0 ? decoded.slice(1) : decoded;
  });
  const distanceKm = segments.reduce((sum, segment) => sum + Number(segment.distanceKm || 0), 0);
  const durationMin = segments.reduce((sum, segment) => sum + Number(segment.durationMin || 0), 0);
  return {
    polyline: encodePolyline(coordinates),
    distanceKm,
    distanceText: `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)} km`,
    durationMin,
    durationText: `${Math.ceil(durationMin)} min`,
    summary: "Multi-stop route",
    steps: segments.flatMap((segment) => segment.steps || []),
  };
}
