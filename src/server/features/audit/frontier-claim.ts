// Reserve the remaining page budget for pending sitemap URLs; link-only pages
// keep FIFO priority while enough budget remains to include those sitemap pages.
export const FRONTIER_CLAIM_SQL = `
  SELECT url, depth, in_sitemap FROM frontier
  WHERE state = 'pending' AND (
    in_sitemap = 1 OR depth = 0 OR (
      SELECT COUNT(*) FROM frontier WHERE state = 'pending' AND in_sitemap = 1
    ) <= ?
  )
  ORDER BY CASE source WHEN 'link' THEN 0 ELSE 1 END, rowid
  LIMIT ?
`;
