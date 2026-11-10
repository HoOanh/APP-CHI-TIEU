export const PWA_CACHE_PREFIX = 'arc-irobot-';

export async function clearPwaCache(): Promise<number> {
  if (!('caches' in window)) {
    throw new Error('Trình duyệt không hỗ trợ bộ nhớ đệm của ứng dụng.');
  }

  const cacheNames = await caches.keys();
  const appCacheNames = cacheNames.filter((name) => name.startsWith(PWA_CACHE_PREFIX));
  const deletionResults = await Promise.all(appCacheNames.map((name) => caches.delete(name)));

  return deletionResults.filter(Boolean).length;
}
