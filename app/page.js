import Link from "next/link";
import DiscoverySeriesCard from "@/components/DiscoverySeriesCard";
import { getParentSeriesCatalogPage } from "@/lib/series";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = buildPageMetadata({
  title: "Gacha Lens | ガチャの新作・価格・在庫情報",
  description: "今月・来月の新作、発売中のガチャ、定価・ラインナップ・相場情報を画像から探せます。",
  path: "/",
});

const HOME_CARD_LIMIT = 8;

export default async function Home() {
  const currentMonth = jstMonthKey(0);
  const nextMonth = jstMonthKey(1);
  const [currentPage, nextPage, releasedPage] = await Promise.all([
    getParentSeriesCatalogPage({ month: currentMonth, page: 1, pageSize: HOME_CARD_LIMIT, sort: "newest" }),
    getParentSeriesCatalogPage({ month: nextMonth, page: 1, pageSize: HOME_CARD_LIMIT, sort: "newest" }),
    getParentSeriesCatalogPage({ release: "released", page: 1, pageSize: HOME_CARD_LIMIT, sort: "newest" }),
  ]);

  return (
    <main className="site-main consumer-home">
      <div className="site-shell consumer-home__shell">
        <section className="consumer-home-hero" aria-labelledby="home-title">
          <div className="consumer-home-hero__copy">
            <p className="consumer-home-hero__eyebrow">CAPSULE TOY DISCOVERY</p>
            <h1 id="home-title">次に回したいガチャを、見つける。</h1>
            <p>新作・発売日・定価・ラインナップを画像からすばやく。相場は実データがある商品だけ表示します。</p>
          </div>

          <form className="consumer-home-search" action="/series" method="get" role="search">
            <input type="hidden" name="scope" value="series" />
            <label className="sr-only" htmlFor="home-search">ガチャを検索</label>
            <input id="home-search" name="q" type="search" placeholder="ガチャ名・作品・メーカーで検索" />
            <button type="submit">検索</button>
          </form>

          <nav className="consumer-home-quick" aria-label="発売時期から探す">
            <Link href={`/series?scope=series&month=${currentMonth}&sort=newest`}>
              <strong>今月</strong><span>{formatMonthLabel(currentMonth)}発売</span>
            </Link>
            <Link href={`/series?scope=series&month=${nextMonth}&sort=newest`}>
              <strong>来月</strong><span>{formatMonthLabel(nextMonth)}発売</span>
            </Link>
            <Link href="/series?scope=series&release=released&sort=newest">
              <strong>発売中</strong><span>いま回せる商品</span>
            </Link>
          </nav>
        </section>

        <HomeShelf
          id="this-month"
          title={`${formatMonthLabel(currentMonth)}のガチャ`}
          description="今月発売のシリーズを画像からチェック"
          href={`/series?scope=series&month=${currentMonth}&sort=newest`}
          items={currentPage.items}
        />
        <HomeShelf
          id="next-month"
          title={`${formatMonthLabel(nextMonth)}発売予定`}
          description="次に登場するシリーズを先に見つける"
          href={`/series?scope=series&month=${nextMonth}&sort=newest`}
          items={nextPage.items}
        />
        <HomeShelf
          id="released"
          title="発売中から探す"
          description="公開中のシリーズを新しい順に"
          href="/series?scope=series&release=released&sort=newest"
          items={releasedPage.items}
        />

        <section className="consumer-home-explore" aria-labelledby="explore-title">
          <div>
            <p className="consumer-home-section__eyebrow">BROWSE</p>
            <h2 id="explore-title">別の切り口から探す</h2>
          </div>
          <nav aria-label="別の探し方">
            <Link href="/franchises">作品・キャラクターから</Link>
            <Link href="/brands">メーカーから</Link>
            <Link href="/categories">カテゴリから</Link>
            <Link href="/schedule">発売月から</Link>
          </nav>
        </section>
      </div>
    </main>
  );
}

function HomeShelf({ id, title, description, href, items = [] }) {
  return (
    <section className="consumer-home-section" aria-labelledby={`${id}-title`}>
      <div className="consumer-home-section__head">
        <div>
          <p className="consumer-home-section__eyebrow">DISCOVER</p>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        <Link href={href}>すべて見る <span aria-hidden="true">→</span></Link>
      </div>

      {items.length ? (
        <div className="consumer-discovery-grid">
          {items.slice(0, HOME_CARD_LIMIT).map((item, index) => (
            <DiscoverySeriesCard key={item.slug || item.id} item={item} priority={id === "this-month" && index < 4} />
          ))}
        </div>
      ) : (
        <div className="consumer-home-empty">
          <strong>この期間の商品情報を整理しています</strong>
          <span>公開できる情報が揃い次第ここに追加します。</span>
        </div>
      )}
    </section>
  );
}

function jstMonthKey(offset = 0) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month) {
  const [, value] = String(month).split("-");
  return `${Number(value)}月`;
}
