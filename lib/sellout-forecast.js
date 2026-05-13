function safeNumber(value) {
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

function average(min, max) {
  return Math.round((safeNumber(min) + safeNumber(max)) / 2);
}

function sortHistoryAsc(priceHistory) {
  return [...priceHistory].sort((a, b) => {
    return new Date(a.recordedDate) - new Date(b.recordedDate);
  });
}

function sortStockReportsDesc(stockReports) {
  return [...stockReports].sort((a, b) => {
    const dateA = new Date(a.reportDate || a.createdAt || 0);
    const dateB = new Date(b.reportDate || b.createdAt || 0);
    return dateB - dateA;
  });
}

export function buildSelloutForecast(
  series,
  priceHistory = [],
  restockInfo = null,
  stockReports = []
) {
  const reasons = [];
  let score = 0;

  const price = safeNumber(series?.price);
  const itemCount = safeNumber(series?.itemCount);

  if (price > 0 && price <= 400) {
    score += 1;
    reasons.push("1回の価格が低めで回されやすい");
  }

  if (itemCount > 0 && itemCount <= 5) {
    score += 1;
    reasons.push("種類数が少なく、コンプ狙いが入りやすい");
  }

  if (Array.isArray(priceHistory) && priceHistory.length > 0) {
    const sorted = sortHistoryAsc(priceHistory);
    const first = sorted[0];
    const latest = sorted[sorted.length - 1];

    const firstSingleAvg = average(first.singlePriceMin, first.singlePriceMax);
    const latestSingleAvg = average(
      latest.singlePriceMin,
      latest.singlePriceMax
    );

    const firstCompleteAvg = average(
      first.completePriceMin,
      first.completePriceMax
    );
    const latestCompleteAvg = average(
      latest.completePriceMin,
      latest.completePriceMax
    );

    const singleDiff = latestSingleAvg - firstSingleAvg;
    const completeDiff = latestCompleteAvg - firstCompleteAvg;

    if (singleDiff >= 50 || completeDiff >= 100) {
      score += 2;
      reasons.push("相場履歴が上昇傾向にある");
    }

    const totalMachinePrice = price * itemCount;

    if (totalMachinePrice > 0 && latestCompleteAvg > totalMachinePrice) {
      score += 2;
      reasons.push("コンプ相場が定価合計を上回っている");
    }

    if (price > 0 && latestSingleAvg >= price + 100) {
      score += 1;
      reasons.push("単品相場も定価より強い");
    }
  } else {
    reasons.push("相場履歴が少ないため、基本条件だけで判定");
  }

  if (restockInfo?.restockStatus === "planned") {
    score -= 2;
    reasons.push("再販予定があるため、売り切れ圧はやや下がりやすい");
  }

  if (restockInfo?.restockStatus === "done") {
    score -= 1;
    reasons.push("再販済みのため、在庫が戻っている可能性がある");
  }

  if (restockInfo?.restockStatus === "none") {
    score += 1;
    reasons.push("再販情報がなく、品薄になりやすい可能性がある");
  }

  if (Array.isArray(stockReports) && stockReports.length > 0) {
    const sortedReports = sortStockReportsDesc(stockReports);
    const latestReport = sortedReports[0];

    if (latestReport?.stockStatus === "sold_out") {
      score += 2;
      reasons.push("直近の店頭報告では売り切れが確認されている");
    }

    if (latestReport?.stockStatus === "low_stock") {
      score += 1;
      reasons.push("直近の店頭報告では在庫が少なめ");
    }

    if (latestReport?.stockStatus === "in_stock") {
      score -= 1;
      reasons.push("直近の店頭報告ではまだ在庫が確認されている");
    }

    const recentThree = sortedReports.slice(0, 3);
    const recentSoldOutCount = recentThree.filter(
      (item) => item.stockStatus === "sold_out"
    ).length;

    if (recentSoldOutCount >= 2) {
      score += 1;
      reasons.push("複数の店頭報告で売り切れ傾向が見られる");
    }
  } else {
    reasons.push("在庫目撃情報が少ないため、店頭状況は未反映");
  }

  if (score < 0) {
    score = 0;
  }

  let level = "low";
  let label = "低め";
  let summary = "今の材料では、売り切れ圧はそこまで強くなさそうです。";

  if (score >= 6) {
    level = "very-high";
    label = "かなり高そう";
    summary = "今の材料では、売り切れの勢いがかなり強そうです。";
  } else if (score >= 4) {
    level = "high";
    label = "やや高そう";
    summary = "今の材料では、売り切れの可能性は高めです。";
  } else if (score >= 2) {
    level = "medium";
    label = "ふつう";
    summary = "今の材料では、売り切れやすさは中くらいです。";
  }

  return {
    score,
    level,
    label,
    summary,
    reasons,
  };
}