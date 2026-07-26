import React, { memo, useCallback, useRef } from 'react';
import AssetCard from '../AssetCard/AssetCard';
import AssetCardSkeleton from '../Skeleton/AssetCardSkeleton';
import VirtualList from '../VirtualList/VirtualList';
import Card from '../Card/Card';
import EmptyState from '../EmptyState/EmptyState';
import { FAILED_TO_LOAD_ASSETS } from '../../constants/errors';
import styles from './AssetGrid.module.css';

const ITEM_HEIGHT = 340;

/**
 * AssetGrid — renders the grid of asset cards with keyboard navigation.
 *
 * Issue #371 — Keyboard Navigation for Marketplace Grid:
 *  - Arrow Left / Right / Up / Down  → move focus between cards
 *  - Enter / Space                   → activates the focused card (dispatches click)
 *  - Escape                          → blurs the focused card and returns focus to grid root
 *
 * Cards receive a visible focus ring through the CSS class `.cardFocusable` so
 * the indicator is consistent across dark and light themes.
 */
function AssetGrid({ assets = [], loading = false, error = null, isEmpty = false }) {
  // Ref for the grid container so we can manage roving-tabindex focus
  const gridRef = useRef(null);

  /**
   * Keyboard handler attached to the grid wrapper.
   * We compute the number of columns from the grid's current layout so arrow
   * navigation mirrors the visual arrangement.
   */
  const handleKeyDown = useCallback(
    (e) => {
      const grid = gridRef.current;
      if (!grid) return;

      const focusableCards = Array.from(
        grid.querySelectorAll('[data-asset-card]'),
      );
      if (focusableCards.length === 0) return;

      const activeEl = document.activeElement;
      const currentIndex = focusableCards.findIndex(
        (el) => el === activeEl || el.contains(activeEl),
      );

      // Estimate number of columns from the DOM geometry
      const firstTop = focusableCards[0]?.getBoundingClientRect().top ?? 0;
      const columnsCount = focusableCards.filter(
        (el) => Math.abs(el.getBoundingClientRect().top - firstTop) < 10,
      ).length || 1;

      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowRight':
          nextIndex = Math.min(currentIndex + 1, focusableCards.length - 1);
          break;
        case 'ArrowLeft':
          nextIndex = Math.max(currentIndex - 1, 0);
          break;
        case 'ArrowDown':
          nextIndex = Math.min(currentIndex + columnsCount, focusableCards.length - 1);
          break;
        case 'ArrowUp':
          nextIndex = Math.max(currentIndex - columnsCount, 0);
          break;
        case 'Enter':
        case ' ':
          if (currentIndex >= 0) {
            e.preventDefault();
            focusableCards[currentIndex].click();
          }
          return;
        case 'Escape':
          if (currentIndex >= 0) {
            focusableCards[currentIndex].blur();
            grid.focus();
          }
          return;
        default:
          return;
      }

      if (nextIndex !== currentIndex && nextIndex >= 0) {
        e.preventDefault();
        focusableCards[nextIndex].focus();
      }
    },
    [],
  );

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
      /* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
      <div
        role="list"
        ref={gridRef}
        className={styles.grid}
        onKeyDown={handleKeyDown}
        /* grid itself is not focusable via tab; cards are */
        tabIndex={-1}
        aria-label="Asset cards — use arrow keys to navigate"
      >
        {assets.map((asset) => (
          /* Each card wrapper is keyboard-focusable */
          <div
            key={asset.contractId}
            role="listitem"
            data-asset-card
            tabIndex={0}
            className={styles.cardFocusable}
            aria-label={asset.title || 'Asset card'}
          >
            <AssetCard asset={asset} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={styles.virtualContainer}
      ref={gridRef}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      aria-label="Asset cards — use arrow keys to navigate"
    >
      <VirtualList
        items={assets}
        itemHeight={ITEM_HEIGHT}
        height={Math.min(assets.length * ITEM_HEIGHT, 800)}
        overscan={3}
        keyExtractor={(item) => item.contractId}
        renderItem={({ item }) => (
          <div
            className={`${styles.virtualItem} ${styles.cardFocusable}`}
            data-asset-card
            tabIndex={0}
            role="listitem"
            aria-label={item.title || 'Asset card'}
          >
            <AssetCard asset={item} />
          </div>
        )}
      />
    </div>
  );
}

export default memo(AssetGrid);
