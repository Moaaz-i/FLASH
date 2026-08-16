/**
 * FLASH GeoJSON & Spatial Indexing Plugin (FlashSpatialPlugin)
 * 2DSphere spatial calculations: Haversine distance, $near proximity, $geoWithin polygon bounding box
 */
export class FlashSpatialPlugin {
  static EARTH_RADIUS_METERS = 6371000;

  /**
   * Calculates great-circle distance between two [longitude, latitude] coordinates in meters
   * @param {Array<number>} coord1 - [lng, lat]
   * @param {Array<number>} coord2 - [lng, lat]
   * @returns {number} Distance in meters
   */
  static haversineDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;

    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return this.EARTH_RADIUS_METERS * c;
  }

  /**
   * Tests if a Point [lng, lat] is inside a GeoJSON Polygon coordinates ring (Ray Casting)
   * @param {Array<number>} point - [lng, lat]
   * @param {Array<Array<number>>} polygon - Array of [lng, lat] polygon vertices
   * @returns {boolean}
   */
  static isPointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Evaluates $near proximity query over an array of documents
   * @param {Array<object>} docs
   * @param {string} field - e.g. 'location'
   * @param {object} nearSpec - { $geometry: { coordinates: [lng, lat] }, $maxDistance, $minDistance }
   */
  static filterNear(docs, field, nearSpec) {
    const center = nearSpec.$geometry ? nearSpec.$geometry.coordinates : nearSpec.coordinates;
    const maxDist = nearSpec.$maxDistance || Infinity;
    const minDist = nearSpec.$minDistance || 0;

    const scored = [];
    for (const doc of docs) {
      const loc = doc[field];
      if (!loc || !loc.coordinates) continue;
      const dist = this.haversineDistance(center, loc.coordinates);
      if (dist >= minDist && dist <= maxDist) {
        scored.push({ doc: { ...doc, calculatedDistance: Math.round(dist) }, dist });
      }
    }

    scored.sort((a, b) => a.dist - b.dist);
    return scored.map(s => s.doc);
  }
}
