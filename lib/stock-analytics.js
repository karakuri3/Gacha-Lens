function sortStockReportsDesc(stockReports) {
  return [...stockReports].sort((a, b) => {
    const dateA = new Date(a.reported_at || a.reportDate || a.createdAt || 0);
    const dateB = new Date(b.reported_at || b.reportDate || b.createdAt || 0);
    return dateB - dateA;
  });
}

function getStockStatusLabel(status) {
  if (status === "sold_out") return "売り切れ";
  if (status === "low_stock") return "残り少なめ";
  if (status === "in_stock") return "在庫あり";
  return "不明";
}

function getStoreText(report) {
  const parts = [report?.region || report?.prefecture, report?.shop_name || report?.storeName].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "店舗情報なし";
}

export function analyzeStockReports(stockReports) {
  if (!Array.isArray(stockReports) || stockReports.length === 0) {
    return {
      hasReports: false,
      pressureLevel: "unknown",
      pressureLabel: "情報不足",
      latestStatusLabel: "情報なし",
      latestReportDate: "データなし",
      latestStoreText: "データなし",
      summaryText:
        "在庫目撃情報がまだ少ないため、店頭の状況は判断しにくいです。",
    };
  }

  const sortedReports = sortStockReportsDesc(stockReports);
  const latestReport = sortedReports[0];
  const recentThree = sortedReports.slice(0, 3);

  let pressureScore = 0;

  for (const item of recentThree) {
    const status = item.status || item.stockStatus;
    if (status === "sold_out") {
      pressureScore += 2;
    }

    if (status === "low" || status === "low_stock") {
      pressureScore += 1;
    }

    if (status === "in_stock" || status === "restocked") {
      pressureScore -= 1;
    }
  }

  const latestStatus = latestReport?.status || latestReport?.stockStatus;
  if (latestStatus === "sold_out") {
    pressureScore += 1;
  }

  if (latestStatus === "in_stock" || latestStatus === "restocked") {
    pressureScore -= 1;
  }

  let pressureLevel = "low";
  let pressureLabel = "在庫あり寄り";

  if (pressureScore >= 5) {
    pressureLevel = "very-high";
    pressureLabel = "かなり品薄";
  } else if (pressureScore >= 2) {
    pressureLevel = "high";
    pressureLabel = "やや品薄";
  } else if (pressureScore >= 0) {
    pressureLevel = "medium";
    pressureLabel = "ふつう";
  }

  const soldOutCount = recentThree.filter(
    (item) => (item.status || item.stockStatus) === "sold_out"
  ).length;
  const lowStockCount = recentThree.filter(
    (item) => ["low", "low_stock"].includes(item.status || item.stockStatus)
  ).length;
  const inStockCount = recentThree.filter(
    (item) => ["in_stock", "restocked"].includes(item.status || item.stockStatus)
  ).length;

  const latestStatusLabel = latestReport?.status_label || getStockStatusLabel(latestStatus);
  const latestReportDate = latestReport?.reported_at || latestReport?.reportDate || "データなし";
  const latestStoreText = getStoreText(latestReport);

  const summaryText = `${latestReportDate} 時点の直近報告は「${latestStatusLabel}」です。直近3件では 売り切れ ${soldOutCount}件 / 残り少なめ ${lowStockCount}件 / 在庫あり ${inStockCount}件 でした。`;

  return {
    hasReports: true,
    pressureLevel,
    pressureLabel,
    latestStatusLabel,
    latestReportDate,
    latestStoreText,
    summaryText,
  };
}
