import React, { memo } from 'react';
import AssetCard from '../AssetCard/AssetCard';
import AssetCardSkeleton from '../Skeleton/AssetCardSkeleton';
import Card from '../Card/Card';
import EmptyState from '../EmptyState/EmptyState';
import { FAILED_TO_LOAD_ASSETS } from '../../constants/errors';
import styles from './AssetGrid.module.css';

/**
 * AssetGrid — responsive grid of AssetCards.
 *
 * @param {Array}    assets       - Array of asset metadata objects
 * @param {boolean}  loading      - Is data being fetched?
 * @param {string}   error        - Error message if fetch failed
 * @param {boolean}  isEmpty      - True when fetch succeeded but returned 0 assets
 */
function AssetGrid({ assets = [], loading = false, error = null, isEmpty = false }) {
  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <AssetCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <EmptyState
        variant="generic"
        title={FAILED_TO_LOAD_ASSETS}
        description={error}
        actions={[]}
      />
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (isEmpty || assets.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title="No assets available"
        description="Check back later for new listings."
        actions={[
          { label: 'Refresh', onClick: () => window.location.reload(), variant: 'primary' },
        ]}
      />
    );
  }

  // ── Normal state ───────────────────────────────────────────────────────
  return (
    <div className={styles.grid}>
      {assets.map((asset) => (
        <AssetCard key={asset.contractId} asset={asset} />
      ))}
    </div>
  );
}

export default memo(AssetGrid);
