// Haversine distance in km between two lat/lng points.
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Finds approved, non-suspended delivery boys with a known live location within
// radiusKm of the given point, sorted nearest-first. Falls back to ALL approved
// drivers (unsorted-by-distance, since we don't know where they are) if none
// currently have a live location on file - better to offer it to someone than
// to nobody.
async function findNearbyDeliveryBoys(DeliveryBoy, lat, lng, radiusKm = 8) {
  const approved = await DeliveryBoy.find({ status: 'approved' });

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return approved;
  }

  const withLocation = approved.filter(d => d.liveLocation && typeof d.liveLocation.lat === 'number');
  if (!withLocation.length) return approved;

  const nearby = withLocation
    .map(d => ({ driver: d, dist: distanceKm(lat, lng, d.liveLocation.lat, d.liveLocation.lng) }))
    .filter(x => x.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map(x => x.driver);

  return nearby.length ? nearby : approved; // nobody within radius -> offer to everyone approved anyway
}

module.exports = { distanceKm, findNearbyDeliveryBoys };
