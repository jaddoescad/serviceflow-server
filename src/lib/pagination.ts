/**
 * Shared pagination types and utilities
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Parse pagination parameters from query string
 */
export function parsePaginationParams(query: {
  page?: string;
  pageSize?: string;
  limit?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}): PaginationParams {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? query.limit ?? '25', 10) || 25));

  return {
    page,
    pageSize,
    search: query.search?.trim() || undefined,
    sortBy: query.sortBy || undefined,
    sortOrder: query.sortOrder === 'desc' ? 'desc' : 'asc',
  };
}

/**
 * Calculate pagination metadata from total count
 */
export function calculatePaginationMeta(
  totalCount: number,
  page: number,
  pageSize: number
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  return {
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
  };
}

/**
 * Calculate offset for database query
 */
export function calculateOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * Build a paginated response object
 */
export function buildPaginatedResponse<T>(
  data: T[],
  totalCount: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    pagination: calculatePaginationMeta(totalCount, params.page, params.pageSize),
  };
}
