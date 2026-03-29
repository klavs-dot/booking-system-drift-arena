// Vienkāršs atmiņas kešs — saglabā datus starp pieprasījumiem
let cache = null;
let cacheTime = 0;
const TTL = 30 * 1000; // 30 sekundes

export function getCache() {
  if (cache && Date.now() - cacheTime < TTL) return cache;
  return null;
}

export function setCache(data) {
  cache = data;
  cacheTime = Date.now();
}

export function clearCache() {
  cache = null;
  cacheTime = 0;
}
