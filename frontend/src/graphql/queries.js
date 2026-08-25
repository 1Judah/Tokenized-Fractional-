// Copyright (c) 2026 Tokenized Fractional RWA Marketplace Contributors
// SPDX-License-Identifier: MIT

/**
 * src/graphql/queries.js — GraphQL queries and mutations.
 *
 * Defines GraphQL operations for the marketplace including order management.
 */

export const GET_ORDERS = `
  query GetOrders($assetId: ID!, $status: OrderStatus) {
    orders(assetId: $assetId, status: $status) {
      id
      assetId
      userId
      type
      amount
      price
      status
      createdAt
      txHash
    }
  }
`;

export const GET_ORDER_BOOK = `
  query GetOrderBook($assetId: ID!) {
    orderBook(assetId: $assetId) {
      buyOrders {
        id
        userId
        amount
        price
        status
        createdAt
      }
      sellOrders {
        id
        userId
        amount
        price
        status
        createdAt
      }
    }
  }
`;

export const PLACE_ORDER = `
  mutation PlaceOrder($input: PlaceOrderInput!) {
    placeOrder(input: $input) {
      id
      assetId
      userId
      type
      amount
      price
      status
      createdAt
      txHash
    }
  }
`;

export const CANCEL_ORDER = `
  mutation CancelOrder($orderId: ID!) {
    cancelOrder(orderId: $orderId) {
      id
      status
      cancelledAt
    }
  }
`;
