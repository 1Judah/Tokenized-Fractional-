// Copyright (c) 2026 Tokenized Fractional RWA Marketplace Contributors
// SPDX-License-Identifier: MIT

/**
 * src/components/OrderBook/OrderBook.jsx — Order book with optimistic pending orders.
 *
 * Displays buy/sell orders with pulsing badge for pending transactions.
 */

import React from 'react';
import { useQuery } from '@apollo/client';
import { GET_ORDER_BOOK } from '../../graphql/queries';
import Card from '../Card/Card';
import styles from './OrderBook.module.css';

export default function OrderBook({ assetId }) {
  const { data, loading, error } = useQuery(GET_ORDER_BOOK, {
    variables: { assetId },
    pollInterval: 5000, // Poll for updates every 5 seconds
  });

  if (loading) {
    return (
      <Card className={styles.orderBook}>
        <div className={styles.header}>Order Book</div>
        <div className={styles.loading}>Loading orders...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={styles.orderBook}>
        <div className={styles.header}>Order Book</div>
        <div className={styles.error}>Failed to load orders</div>
      </Card>
    );
  }

  const { buyOrders = [], sellOrders = [] } = data?.orderBook || {};

  return (
    <Card className={styles.orderBook}>
      <div className={styles.header}>Order Book</div>

      {/* Buy Orders */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>Buy Orders</div>
        {buyOrders.length === 0 ? (
          <div className={styles.empty}>No buy orders</div>
        ) : (
          <div className={styles.orderList}>
            {buyOrders.map((order) => (
              <OrderRow key={order.id} order={order} type="buy" />
            ))}
          </div>
        )}
      </div>

      {/* Sell Orders */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>Sell Orders</div>
        {sellOrders.length === 0 ? (
          <div className={styles.empty}>No sell orders</div>
        ) : (
          <div className={styles.orderList}>
            {sellOrders.map((order) => (
              <OrderRow key={order.id} order={order} type="sell" />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function OrderRow({ order, type }) {
  const isPending = order.status === 'pending';
  const isOptimistic = order.isOptimistic;

  return (
    <div
      className={`${styles.orderRow} ${styles[type]} ${isPending ? styles.pending : ''}`}
    >
      <div className={styles.orderInfo}>
        <span className={styles.orderAmount}>{order.amount} shares</span>
        <span className={styles.orderPrice}>
          {(order.price / 1e7).toFixed(7)} XLM
        </span>
      </div>

      {(isPending || isOptimistic) && (
        <div className={styles.badgeContainer}>
          <span className={styles.pulsingBadge}>
            {isOptimistic ? 'Optimistic' : 'Pending'}
          </span>
        </div>
      )}

      <div className={styles.orderMeta}>
        <span className={styles.orderTime}>
          {new Date(order.createdAt).toLocaleTimeString()}
        </span>
        {order.txHash && (
          <a
            href={`https://stellar.expert/tx/${order.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.txLink}
          >
            View Tx
          </a>
        )}
      </div>
    </div>
  );
}
