import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("loads the driver vehicle screen with one enriched request", () => {
  const vehicleSource = readProjectFile("app/chauffeur/vehicles.tsx");
  const routesSource = readProjectFile("server/routes.ts");

  assert.match(vehicleSource, /apiRequest\("GET", "\/api\/vehicles"\)/);
  assert.doesNotMatch(vehicleSource, /\/api\/vehicles\/\$\{vehicle\.id\}/);
  assert.match(routesSource, /activeVehicleId: chauffeur\?\.activeVehicleId \|\| null/);
  assert.match(routesSource, /operatorProfile/);
  assert.match(routesSource, /documents/);
});

test("shows progress and the selected state while choosing a vehicle", () => {
  const vehicleSource = readProjectFile("app/chauffeur/vehicles.tsx");

  assert.match(vehicleSource, /selectingVehicleId/);
  assert.match(vehicleSource, /Selecting\.\.\./);
  assert.match(vehicleSource, /checkmark-circle/);
  assert.match(vehicleSource, /Selected for Driving/);
});

test("prevents unrelated screen state from rerendering the native map", () => {
  const mapSource = readProjectFile("components/A2BMap.native.tsx");

  assert.match(mapSource, /React\.memo\(A2BMap, areMapPropsEqual\)/);
  assert.doesNotMatch(mapSource, /\[A2BMap\] render state/);
});

test("uses websocket first and does not reattach socket callbacks on connect", () => {
  const socketSource = readProjectFile("lib/socket-context.tsx");

  assert.match(socketSource, /transports: \["websocket", "polling"\]/);
  assert.equal(
    socketSource.match(/callbacks\.forEach\(\(callback\) => socket\.on\(event, callback\)\)/g)?.length,
    1,
  );
});

test("deduplicates concurrent reads and gives slow actions immediate feedback", () => {
  const querySource = readProjectFile("lib/query-client.ts");
  const clientSource = readProjectFile("app/client/index.tsx");

  assert.match(querySource, /inFlightGetRequests/);
  assert.match(clientSource, /Calculating route\.\.\./);
  assert.match(clientSource, /Requesting\.\.\./);
  assert.ok(
    clientSource.indexOf("setShowPaymentPicker(true)") <
      clientSource.indexOf('apiRequest("GET", "/api/payments/cards")'),
  );
});
