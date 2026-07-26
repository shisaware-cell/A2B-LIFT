export type NavigationCoordinate = {
  lat: number;
  lng: number;
};

export type NavigationPlatform = "android" | "ios" | "web";

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function isValidCoordinate(coordinate: NavigationCoordinate) {
  return (
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lng) &&
    coordinate.lat >= -90 &&
    coordinate.lat <= 90 &&
    coordinate.lng >= -180 &&
    coordinate.lng <= 180
  );
}

export function buildGoogleMapsNavigationUrl(
  coordinate: NavigationCoordinate,
  platform: NavigationPlatform,
  waypoints: NavigationCoordinate[] = [],
) {
  if (!isValidCoordinate(coordinate)) return null;
  const validWaypoints = waypoints.filter(isValidCoordinate);
  if (validWaypoints.length > 0) {
    return buildGoogleMapsWebNavigationUrl(coordinate, validWaypoints);
  }

  const destination = `${formatCoordinate(coordinate.lat)},${formatCoordinate(coordinate.lng)}`;

  if (platform === "android") {
    return `google.navigation:q=${destination}&mode=d`;
  }

  if (platform === "ios") {
    return `comgooglemaps://?daddr=${destination}&directionsmode=driving`;
  }

  return buildGoogleMapsWebNavigationUrl(coordinate);
}

export function buildGoogleMapsWebNavigationUrl(
  coordinate: NavigationCoordinate,
  waypoints: NavigationCoordinate[] = [],
) {
  if (!isValidCoordinate(coordinate)) return null;

  const destination = `${formatCoordinate(coordinate.lat)},${formatCoordinate(coordinate.lng)}`;
  const validWaypoints = waypoints.filter(isValidCoordinate);
  const waypointParam = validWaypoints.length
    ? `&waypoints=${encodeURIComponent(validWaypoints.map((point) => `${formatCoordinate(point.lat)},${formatCoordinate(point.lng)}`).join("|"))}`
    : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${waypointParam}&travelmode=driving`;
}
