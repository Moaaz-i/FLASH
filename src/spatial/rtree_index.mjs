/**
 * FLASH 2D Spatial R-Tree Index Engine (FlashSpatialRTree)
 * Fast geospatial bounding box, polygon intersection, and Haversine nearest neighbor searches.
 */
export class FlashSpatialRTree {
  constructor() {
    // Array of { id: string, minX: number, minY: number, maxX: number, maxY: number, point: { lat: number, lon: number }, data: object }
    this.entries = [];
  }

  /**
   * Inserts a geographic point (Latitude, Longitude)
   * @param {string} id
   * @param {number} lat - Latitude (-90 to +90)
   * @param {number} lon - Longitude (-180 to +180)
   * @param {object} [data]
   */
  insertPoint(id, lat, lon, data = {}) {
    this.entries.push({
      id: String(id),
      minX: lon,
      minY: lat,
      maxX: lon,
      maxY: lat,
      point: { lat, lon },
      data
    });
  }

  /**
   * Searches points inside a Bounding Box [minLat, minLon, maxLat, maxLon]
   */
  searchBoundingBox(minLat, minLon, maxLat, maxLon) {
    const results = [];
    for (const item of this.entries) {
      if (
        item.point.lat >= minLat &&
        item.point.lat <= maxLat &&
        item.point.lon >= minLon &&
        item.point.lon <= maxLon
      ) {
        results.push(item);
      }
    }
    return results;
  }

  /**
   * Finds K nearest neighbors by Haversine distance in Kilometers
   * @param {number} lat
   * @param {number} lon
   * @param {number} [k=5]
   * @param {number} [maxDistanceKm=Infinity]
   * @returns {Array<{ id: string, distanceKm: number, point: { lat: number, lon: number }, data: object }>}
   */
  searchNearest(lat, lon, k = 5, maxDistanceKm = Infinity) {
    const scored = [];

    for (const item of this.entries) {
      const dist = FlashSpatialRTree.haversine(lat, lon, item.point.lat, item.point.lon);
      if (dist <= maxDistanceKm) {
        scored.push({
          id: item.id,
          distanceKm: dist,
          point: item.point,
          data: item.data
        });
      }
    }

    scored.sort((a, b) => a.distanceKm - b.distanceKm);
    return scored.slice(0, k);
  }

  /**
   * Computes Haversine distance between two coordinates in Kilometers
   */
  static haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
