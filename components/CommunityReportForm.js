"use client";

import { useState } from "react";

export default function CommunityReportForm({ item }) {
  const [state, setState] = useState({ status: "idle", message: "" });
  const [reportType, setReportType] = useState(item.is_released ? "sold_price" : "in_stock");
  const needsPrice = ["sold_price", "asking_price", "buyback_price"].includes(reportType);

  async function submit(event) {
    event.preventDefault();
    setState({ status: "sending", message: "" });
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.variantId = item.variant_id;
    payload.reportType = reportType;

    const response = await fetch("/api/community-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState({ status: "error", message: result.error || "送信できませんでした" });
      return;
    }
    event.currentTarget.reset();
    setState({ status: "success", message: "報告を受け付けました。確認後に反映します。" });
  }

  return (
    <form className="community-form" onSubmit={submit}>
      <div className="community-form__head">
        <div>
          <h2>価格・在庫を報告</h2>
          <p>確認後に相場や在庫情報へ反映します。</p>
        </div>
        <span>匿名投稿</span>
      </div>
      <div className="community-form__grid">
        <label className="field">
          <span>報告内容</span>
          <select name="reportType" value={reportType} onChange={(event) => setReportType(event.target.value)}>
            {item.is_released ? <option value="sold_price">売れた価格</option> : null}
            {item.is_released ? <option value="asking_price">販売価格</option> : null}
            {item.is_released ? <option value="buyback_price">買取価格</option> : null}
            <option value="in_stock">在庫あり</option>
            <option value="low_stock">残り少ない</option>
            <option value="sold_out">売り切れ</option>
            <option value="restocked">再入荷</option>
          </select>
        </label>
        {needsPrice ? (
          <label className="field">
            <span>価格</span>
            <input name="price" inputMode="numeric" placeholder="例: 680" required />
          </label>
        ) : null}
        <label className="field">
          <span>店舗・サービス</span>
          <input name="shopName" maxLength={100} placeholder="例: ○○店" />
        </label>
        <label className="field">
          <span>地域</span>
          <input name="region" maxLength={100} placeholder="例: 東京都" />
        </label>
      </div>
      <label className="field">
        <span>確認URL</span>
        <input name="sourceUrl" type="url" placeholder="https://..." />
      </label>
      <label className="field">
        <span>補足</span>
        <textarea name="note" maxLength={500} rows={3} placeholder="確認した日時や商品の状態など" />
      </label>
      <input className="form-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="community-form__footer">
        <button className="button-link" type="submit" disabled={state.status === "sending"}>
          {state.status === "sending" ? "送信中" : "報告する"}
        </button>
        {state.message ? <p className={`form-message form-message--${state.status}`}>{state.message}</p> : null}
      </div>
    </form>
  );
}
