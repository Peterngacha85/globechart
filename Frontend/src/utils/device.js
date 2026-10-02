/** Downscales a photo to a JPEG data URL small enough to upload over mobile data (~150-300 KB). */
export function compressImage(file, maxSide = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not a readable image'));
    };
    img.src = url;
  });
}

const GEO_ERRORS = {
  1: 'Location permission was denied. Allow location for this site in your browser settings, then try again.',
  2: 'Your location is unavailable. Turn on GPS / location services and try again.',
  3: 'Getting your location took too long. Move near a window or outside and try again.',
};

/** Fresh high-accuracy GPS fix: { lat, lng, accuracy } in metres. */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser cannot share your location.'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: Math.round(coords.accuracy) }),
      (err) => reject(new Error(GEO_ERRORS[err.code] || 'Could not get your location.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

// Same great-circle formula the server uses to accept or refuse a submission
export function distanceMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

export const mapsLink =({ lat, lng }) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
