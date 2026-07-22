import { buildMarketCoverageReport, loadMarketCoverageData } from "./market-coverage-data.mjs";

const data = await loadMarketCoverageData();
const report = buildMarketCoverageReport(data);
console.log(JSON.stringify(report, null, 2));
