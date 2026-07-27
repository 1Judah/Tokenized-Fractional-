import { create } from 'zustand';
import { apiCacheService } from '../services/apiCacheService.js';

export const useAssetStore = create((set, get) => ({
  assetMeta: null,
  isFetchingMeta: false,
  metaError: null,

  assets: [],
  isFetchingAssets: false,
  assetsError: null,

  fetchMetadata: async (contractId, apiUrl) => {
    if (!contractId || contractId.length < 50) return;
    if (get().isFetchingMeta) return;

    set({ isFetchingMeta: true, metaError: null });
    try {
      const url = `${apiUrl}/api/v1/rwa/${contractId}`;
      const cached = apiCacheService.get(url);
      if (cached) {
        set({ assetMeta: cached.data });
        return;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        apiCacheService.set(url, data, null, 2 * 60 * 1000);
        set({ assetMeta: data });
      } else {
        console.warn('[AssetStore] Metadata endpoint returned', res.status);
        set({ metaError: `Metadata unavailable (${res.status})` });
      }
    } catch (err) {
      console.warn('[AssetStore] Metadata server unreachable:', err.message);
    } finally {
      set({ isFetchingMeta: false });
    }
  },

  fetchAllAssets: async (apiUrl) => {
    if (get().isFetchingAssets) return;

    set({ isFetchingAssets: true, assetsError: null });
    try {
      const url = `${apiUrl}/api/v1/rwa`;
      const cached = apiCacheService.get(url);
      if (cached) {
        set({ assets: cached.data.data || [] });
        return;
      }
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        apiCacheService.set(url, json, null, 2 * 60 * 1000);
        set({ assets: json.data || [] });
      } else {
        console.warn('[AssetStore] Assets endpoint returned', res.status);
        set({ assetsError: `Unable to load assets (${res.status})` });
      }
    } catch (err) {
      console.warn('[AssetStore] Assets server unreachable:', err.message);
      set({
        assetsError: 'Unable to reach the metadata server. Please try again.',
      });
    } finally {
      set({ isFetchingAssets: false });
    }
  },

  clearMeta: () => {
    apiCacheService.invalidate('/api/v1/rwa');
    set({ assetMeta: null, metaError: null });
  },

  clearMetaError: () => set({ metaError: null }),

  clearAssets: () => {
    apiCacheService.invalidate('/api/v1/rwa');
    set({ assets: [], assetsError: null });
  },
}));