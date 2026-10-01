export const PAGE_SIZE = 25;

// Slices `items` down to the current page. Use alongside <Pagination>.
// `pageSize` is optional - lists that don't pass it keep the default 25.
export function paginate(items, page, pageSize = PAGE_SIZE) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function getTotalPages(totalItems, pageSize = PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}
