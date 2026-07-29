import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isAllowed, setAllowed, getUserInfo } from "@stellar/freighter-api";

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

      // ── Existing actions ───────────────────────────────────────────────────

      /**
       * Silently re-check whether Freighter has already granted access.
       * Called on app mount to restore session without prompting the user.
       */
      checkConnection: async () => {
        try {
          if (await isAllowed()) {
            const user = await getUserInfo();
            if (user?.publicKey) {
              set({
                publicKey: user.publicKey,
                walletError: null,
                activeWallet: "freighter",
              });
              return user.publicKey;
            }
          }
        } catch (err) {
          console.error("[WalletStore] Freighter check failed:", err);
        }
        set({ publicKey: null, shares: 0 });
        return null;
      },

      /**
       * Prompt the user to authorise Freighter then read their public key.
       */
      connect: async () => {
        set({ isConnecting: true, walletError: null });
        try {
          await setAllowed();
          const user = await getUserInfo();
          if (user?.publicKey) {
            const entry = {
              wallet: "freighter",
              publicKey: user.publicKey,
              timestamp: Date.now(),
            };

            set((state) => ({
              publicKey: user.publicKey,
              isConnecting: false,
              activeWallet: "freighter",
              reconnectAttempts: 0,
              connectionHistory: [entry, ...state.connectionHistory].slice(
                0,
                20,
              ), // keep last 20
            }));

            return user.publicKey;
          }
          throw new Error("No public key returned by Freighter.");
        } catch (err) {
          const msg =
            "Failed to connect Freighter wallet. Ensure the extension is installed and unlocked.";
          console.error("[WalletStore] connect failed:", err);
          set((state) => ({
            walletError: msg,
            isConnecting: false,
            reconnectAttempts: state.reconnectAttempts + 1,
          }));
          return null;
        }
      },

      disconnect: () => {
        set({
          publicKey: null,
          shares: 0,
          walletError: null,
          isConnecting: false,
          activeWallet: null,
          reconnectAttempts: 0,
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
      name: "rwa-wallet-store",
      partialize: (state) => ({
        publicKey: state.publicKey,
        shares: state.shares,
        activeWallet: state.activeWallet,
        // connectionHistory is intentionally NOT persisted to avoid stale data
      }),
    },
  ),
);
