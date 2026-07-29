// GraphQL schema for RWA Marketplace assets
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getDataFile() {
  return join(__dirname, '..', process.env.DATA_FILE || 'data.json');
}

function loadData() {
  const file = getDataFile();
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

export const typeDefs = `#graphql
  """A document attached to an asset"""
  type Document {
    name: String
    url: String
  }

  """An RWA asset registered in the marketplace"""
  type Asset {
    contractId: ID!
    title: String!
    location: String!
    description: String!
    assetType: String!
    imageUrl: String
    totalValuation: String
    documents: [Document]
    createdAt: String!
    updatedAt: String!
  }

  """Pagination metadata"""
  type Pagination {
    total: Int!
    page: Int!
    limit: Int!
    totalPages: Int!
  }

  """Paginated asset list response"""
  type AssetConnection {
    data: [Asset!]!
    pagination: Pagination!
  }

  """Asset filter input"""
  input AssetFilter {
    assetType: String
    search: String
    page: Int
    limit: Int
  }

  """Complexity analysis result for a query"""
  type ComplexityInfo {
    score: Float!
    depth: Int!
    fieldCount: Int!
    maxAllowed: Float!
    remaining: Float!
  }

  type Query {
    """Retrieve a single asset by contract ID (cost: 1)"""
    asset(contractId: ID!): Asset

    """List assets with optional filtering and pagination (cost: 2 + 0.1 per result)"""
    assets(filter: AssetFilter): AssetConnection!

    """Retrieve complexity analysis for the current query (cost: 0)"""
    queryComplexity: ComplexityInfo!
  }
`;

export const resolvers = {
  Query: {
    asset: (_, { contractId }) => {
      const data = loadData();
      const asset = data[contractId];
      if (!asset) return null;
      return { contractId, ...asset };
    },

    assets: (_, { filter = {} }) => {
      const data = loadData();
      let list = Object.entries(data).map(([contractId, meta]) => ({ contractId, ...meta }));
      const { assetType, search, page, limit } = filter;

      if (assetType) {
        const lower = assetType.toLowerCase();
        list = list.filter(a => a.assetType?.toLowerCase() === lower);
      }
      if (search) {
        const lower = search.toLowerCase();
        list = list.filter(a =>
          a.title?.toLowerCase().includes(lower) ||
          a.description?.toLowerCase().includes(lower)
        );
      }

      const total = list.length;
      const pageNum = Math.max(1, page || 1);
      const pageSize = Math.min(100, Math.max(1, limit || 20));
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (pageNum - 1) * pageSize;
      const sliced = list.slice(offset, offset + pageSize);

      return {
        data: sliced,
        pagination: { total, page: pageNum, limit: pageSize, totalPages },
      };
    },

    queryComplexity: () => {
      return {
        score: 0,
        depth: 0,
        fieldCount: 0,
        maxAllowed: parseFloat(process.env.GRAPHQL_MAX_COMPLEXITY || '100'),
        remaining: parseFloat(process.env.GRAPHQL_MAX_COMPLEXITY || '100'),
      };
    },
  },
};
