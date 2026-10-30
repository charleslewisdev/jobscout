-- Craigslist and Built In adapters were removed; their terms ban automated access.
UPDATE `sources` SET `is_enabled` = 0 WHERE `id` IN ('craigslist-pdx', 'builtin-pdx');
