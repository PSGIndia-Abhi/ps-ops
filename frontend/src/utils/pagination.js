export const PAGE_SIZE = 25;

// Slices `items` down to the current page. Use alongside <Pagination>.
export function paginate(items, page) {
  const start = (page - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

export function getTotalPages(totalItems) {
  return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
}
