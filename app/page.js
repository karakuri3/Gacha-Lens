import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getRankingSeries, getSeriesCatalogCounts } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";
import {
  customerTags,
  formatPriceRange,
  formatSchedule,
  formatScore,
  formatYen,
  isCirculatingItem,
  opportunityScore,
  releasedPriorityScore,
  watchScore,
} from "@/lib/domain/public-display-clean";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const [releasedSeries, upcomingSeries, catalogCounts] = await Promise.all([
    getRankingSeries("released"),
    getRankingSeries("upcoming"),
    getSeriesCatalogCounts(),
  ]);
  const hot = releasedSeries
    .filter(isCirculatingItem)
    .sort((a, b) => releasedPriorityScore(b) - releasedPriorityScore(a));
  const spotlight = hot[0];
  const movingNow = hot.slice(1, 5);
  const upcoming = upcomingSeries
    .filter((item) => !item.is_released && item.variant_type !== "provisional" && (item.forecast_score ?? 0) > 0)
    .sort((a, b) => upcomingPriority(b) - upcomingPriority(a))
    .slice(0, 4);

  return (
    <main className="site-main home-main">
      <div className="site-shell">
        <section className="home-intro">
          <div>
            <p className="eyebrow">CAPSULE TREND GUIDE</p>
            <h1>次に見つけたいガチャが、ここで分かる。</h1>
            <p>新作、話題の単品、価格の動き、在庫情報をひとつに。ガチャをもっと早く、深く楽しむためのトレンドガイドです。</p>
          </div>
          <div className="home-intro__catalog" aria-label="収録単品数">
            <span>収録単品</span>
            <strong>{(catalogCounts?.all ?? 0).toLocaleString("ja-JP")}</strong>
            <small>公式データから随時更新</small>
          </div>
        </section>

        {spotlight ? <Spotlight item={spotlight} /> : null}

        <section className="home-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">MOVING NOW</p>
              <h2 className="section-title">いま動きがある単品</h2>
              <p className="section-sub">出品、売れ行き、在庫の変化をまとめて確認。</p>
            </div>
            <Link href="/ranking" className="text-link">ランキングをすべて見る <span aria-hidden="true">→</span></Link>
          </div>
          <div className="discovery-list">
            {movingNow.map((item, index) => <DiscoveryRow key={item.slug} item={item} index={index + 2} />)}
          </div>
        </section>

        <section className="home-section home-section--upcoming">
          <div className="section-head">
            <div>
              <p className="eyebrow">COMING SOON</p>
              <h2 className="section-title">これから登場する注目作</h2>
              <p className="section-sub">発売前は価格相場ではなく、先行反応と入手難度を表示します。</p>
            </div>
            <Link href="/schedule" className="text-link">発売カレンダー <span aria-hidden="true">→</span></Link>
          </div>
          <div className="discovery-list">
            {upcoming.map((item) => <UpcomingRow key={item.slug} item={item} />)}
          </div>
        </section>

        <nav className="home-explore" aria-label="ガチャを探す">
          <Link href="/ranking"><span>01</span><strong>注目ランキング</strong><small>いま熱い単品を比較</small></Link>
          <Link href="/schedule"><span>02</span><strong>発売カレンダー</strong><small>月と週から新作を探す</small></Link>
          <Link href="/series"><span>03</span><strong>ガチャ図鑑</strong><small>過去商品も含めて検索</small></Link>
        </nav>
      </div>
    </main>
  );
}

function Spotlight({ item }) {
  const tags = customerTags(item, true);
  return (
    <Link href={variantHref(item)} className="hot-spotlight">
      <div className="hot-spotlight__image">
        <ProductImage src={item.image_url} alt={item.name} priority />
        <span className="hot-spotlight__rank">TODAY&apos;S PICK</span>
      </div>
      <div className="hot-spotlight__body">
        <div className="hot-spotlight__topline">
          <span>注目度 {formatScore(watchScore(item))}</span>
          <span>{formatSchedule(item)}</span>
        </div>
        <div>
          <p className="eyebrow">いま注目の単品</p>
          <h2>{item.name}</h2>
          <p className="hot-spotlight__series">{item.series_name}</p>
        </div>
        <div className="hot-spotlight__metrics">
          <div><span>定価</span><strong>{formatYen(item.price)}</strong></div>
          <div><span>参考相場</span><strong>{formatYen(item.market_summary?.single)}</strong></div>
          <div><span>相場の目安</span><strong>{formatPriceRange(item.market_summary?.estimated_resale_range)}</strong></div>
        </div>
        <div className="heat-meter" aria-label={`注目度 ${formatScore(watchScore(item))}`}>
          <span style={{ width: `${watchScore(item) ?? 0}%` }} />
        </div>
        {tags.length ? <div className="tag-row">{tags.map((tag) => <span className="tag tag--signal" key={tag}>{tag}</span>)}</div> : null}
        <span className="text-link">詳しく見る <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

function DiscoveryRow({ item, index }) {
  const tags = customerTags(item, true);
  return (
    <Link href={variantHref(item)} className="discovery-row">
      <span className="discovery-row__index">{String(index).padStart(2, "0")}</span>
      <div className="discovery-row__image"><ProductImage src={item.image_url} alt={item.name} /></div>
      <div className="discovery-row__copy">
        <strong>{item.name}</strong>
        <span>{item.series_name}</span>
      </div>
      <div className="discovery-row__signal">
        <span>{tags[0] || "流通を観測"}</span>
        <strong>{formatScore(watchScore(item))}</strong>
      </div>
      <span className="discovery-row__arrow" aria-hidden="true">→</span>
    </Link>
  );
}

function UpcomingRow({ item }) {
  return (
    <Link href={variantHref(item)} className="discovery-row discovery-row--upcoming">
      <span className="discovery-row__index">{item.schedule_month || "予定"}</span>
      <div className="discovery-row__image"><ProductImage src={item.image_url} alt={item.name} /></div>
      <div className="discovery-row__copy">
        <strong>{item.name}</strong>
        <span>{item.series_name} ・ {formatYen(item.price)}</span>
      </div>
      <div className="discovery-row__signal">
        <span>{formatSchedule(item)}</span>
        <strong>{formatScore(opportunityScore(item))}</strong>
      </div>
      <span className="discovery-row__arrow" aria-hidden="true">→</span>
    </Link>
  );
}

function upcomingPriority(item) {
  return opportunityScore(item) * 12 + (item.forecast_score ?? 0) * 3;
}
