import React, { memo, useMemo } from 'react';
import AssetCard from '../AssetCard/AssetCard';
import AssetCardSkeleton from '../Skeleton/AssetCardSkeleton';
import VirtualList from '../VirtualList/VirtualList';
import Card from '../Card/Card';
import EmptyState from '../EmptyState/EmptyState';
import { FAILED_TO_LOAD_ASSETS } from '../../constants/errors';
import styles from './AssetGrid.module.css';

const ITEM_HEIGHT = 340;

function AssetGrid({ assets = [], loading = false, error = null, isEmpty = false }) {
  if (loading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <AssetCardSkeleton key={i} />
        ))}
      </div>
    );
  }

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

  if (assets.length < 20) {
    return (
      <div className={styles.grid}>
        {assets.map((asset) => (
          <AssetCard key={asset.contractId} asset={asset} />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.virtualContainer}>
      <VirtualList
        items={assets}
        itemHeight={ITEM_HEIGHT}
        height={Math.min(assets.length * ITEM_HEIGHT, 800)}
        overscan={3}
        keyExtractor={(item) => item.contractId}
        renderItem={({ item }) => (
          <div className={styles.virtualItem}>
            <AssetCard asset={item} />
          </div>
        )}
      />
    </div>
  );
}

export default memo(AssetGrid);
