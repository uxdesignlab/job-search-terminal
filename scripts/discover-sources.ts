/**
 * Discover new Greenhouse / Lever / Ashby company slugs from Common Crawl.
 *
 * Usage:
 *   npm run discover:sources
 *
 * Output:
 *   data/discovered-sources.json
 */

import { runSourceDiscovery } from "../src/lib/scanner/source-discovery";

runSourceDiscovery((msg) => console.log(msg))
  .then((summary) => {
    console.log(
      `\nDone. ${summary.valid} valid, ${summary.dead} dead, ${summary.unknown} unknown (${summary.totalCrawled} CC records crawled)`
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
