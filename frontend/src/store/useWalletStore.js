import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isAllowed, setAllowed, getUserInfo } from '@stellar/freighter-api';

const FALLBACK_PROVIDER = {
  uuid: 'freighter-builtin',
  name: 'Freighter',
  rdns: 'app.freighter',
};

/**
 * Supported wallet providers.
 * Only 'freighter' is active; others are placeholders for future integration.
 */
export const WALLET_PROVIDERS = [
  {
    id: "freighter",
    name: "Freighter",
    description: "Stellar's official browser extension wallet",
    status: "available", // 'available' | 'coming_soon'
    downloadUrl: "https://freighter.app",
  },
  {
    id: "lobstr",
    name: "Lobstr",
    description: "Mobile-first Stellar wallet with WalletConnect support",
    status: "coming_soon",
    downloadUrl: "https://lobstr.co",
  },
  {
    id: "xbull",
    name: "xBull",
    description: "Feature-rich Stellar wallet for power users",
    status: "coming_soon",
    downloadUrl: "https://xbull.app",
  },
  {
    id: "albedo",
    name: "Albedo",
    description: "Browser-based signer — no extension required",
    status: "coming_soon",
    downloadUrl: "https://albedo.link",
  },
];

export const useWalletStore = create(
  persist(
    (set, get) => ({
      // ── Existing fields ────────────────────────────────────────────────────
      publicKey: null,
      isConnecting: false,
      walletError: null,
      shares: 0,
      activeProvider: null,
      availableProviders: [],

      // ── New fields ─────────────────────────────────────────────────────────
      /** The wallet provider id that is currently active, e.g. 'freighter' */
      activeWallet: null,

      /** Snapshot of WALLET_PROVIDERS enriched with runtime status at startup */
      availableWallets: WALLET_PROVIDERS,

      /**
       * Ordered list of successful connections.
       * Each entry: { wallet: string, publicKey: string, timestamp: number }
       */
      connectionHistory: [],

      /** Number of consecutive failed connection attempts for the active provider */
      reconnectAttempts: 0,

      // ── Derived ───────────────────────────────────────────────────────────
      isConnected: () => Boolean(get().publicKey),

      setAvailableProviders: (providers) => set({ availableProviders: providers }),

      connectWithProvider: async (provider) => {
        set({ isConnecting: true, walletError: null, activeProvider: provider });
        try {
          if (provider?.rdns?.includes('freighter') || provider?.name?.toLowerCase().includes('freighter') || !provider) {
            await setAllowed();
            const user = await getUserInfo();
            if (user?.publicKey) {
              set({ publicKey: user.publicKey, isConnecting: false });
              return user.publicKey;
            }
            throw new Error('No public key returned by Freighter.');
          }
          if (provider.provider && typeof provider.provider.connect === 'function') {
            const accounts = await provider.provider.connect();
            const pubKey = accounts?.publicKey || accounts?.[0]?.publicKey || accounts?.[0]?.address;
            if (pubKey) {
              set({ publicKey: pubKey, isConnecting: false });
              return pubKey;
            }
            throw new Error('No public key returned by provider.');
          }
          throw new Error('Provider does not support connection.');
        } catch (err) {
          const msg = `Failed to connect ${provider?.name || 'wallet'}. Ensure the extension is installed and unlocked.`;
          console.error('[WalletStore] connect failed:', err);
          set({ walletError: msg, isConnecting: false });
          return null;
        }
      },

      checkConnection: async () => {
        if (import.meta.env.VITE_MOCK_WALLET === 'true') {
          const stored = localStorage.getItem('mock_wallet_pubkey');
          if (stored) {
            set({ publicKey: stored, walletError: null });
            return stored;
          }
          return null;
        }
        try {
          if (await isAllowed()) {
            const user = await getUserInfo();
            if (user?.publicKey) {
              set({ publicKey: user.publicKey, walletError: null, activeProvider: FALLBACK_PROVIDER });
              return user.publicKey;
            }
          }
        } catch (err) {
          console.error('[WalletStore] Freighter check failed:', err);
        }
        set({ publicKey: null, shares: 0 });
        return null;
      },

      /**
       * Prompt the user to authorise Freighter then read their public key.
       */
      connect: async () => {
        set({ isConnecting: true, walletError: null });
        if (import.meta.env.VITE_MOCK_WALLET === 'true') {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const mockPubKey = 'GBAZE64FKVPG4JUUP2BH63746JJ22G3A2S4QPF4UWKVA2RELLFLQZQVR';
          localStorage.setItem('mock_wallet_pubkey', mockPubKey);
          set({ publicKey: mockPubKey, isConnecting: false, activeProvider: FALLBACK_PROVIDER });
          return mockPubKey;
        }
        try {
          await setAllowed();
          const user = await getUserInfo();
          if (user?.publicKey) {
            set({ publicKey: user.publicKey, isConnecting: false, activeProvider: FALLBACK_PROVIDER });
            return user.publicKey;
          }
          throw new Error('No public key returned by Freighter.');
        } catch (err) {
          const msg =
            'Failed to connect Freighter wallet. Ensure the extension is installed and unlocked.';
          console.error('[WalletStore] connect failed:', err);
          set({ walletError: msg, isConnecting: false });
          return null;
        }
      },

      disconnect: () => {
        if (import.meta.env.VITE_MOCK_WALLET === 'true') {
          localStorage.removeItem('mock_wallet_pubkey');
          localStorage.removeItem('mock_shares_balance');
        }
        set({
          publicKey: null,
          shares: 0,
          walletError: null,
          isConnecting: false,
          activeProvider: null,
        });
      },

      setShares: (n) => set({ shares: n }),

      setWalletError: (msg) => set({ walletError: msg }),

      clearWalletError: () => set({ walletError: null }),

      // ── New actions ────────────────────────────────────────────────────────

      /** Manually override the active wallet id (used for future providers) */
      setActiveWallet: (name) => set({ activeWallet: name }),

      /**
       * Manually push a connection record into history.
       * @param {{ wallet: string, publicKey: string, timestamp?: number }} info
       */
      recordConnection: (info) => {
        const entry = {
          wallet: info.wallet,
          publicKey: info.publicKey,
          timestamp: info.timestamp ?? Date.now(),
        };
        set((state) => ({
          connectionHistory: [entry, ...state.connectionHistory].slice(0, 20),
        }));
      },

      resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),

      incrementReconnectAttempts: () =>
        set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),
    }),
    {
      name: 'rwa-wallet-store',
      partialize: (state) => ({
        publicKey: state.publicKey,
        shares: state.shares,
        activeProvider: state.activeProvider,
      }),
    },
  ),
);
