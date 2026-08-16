import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AccessoryStockForm } from '@/components/staff/AccessoryStockForm';
import { ProductEditor, type EditableProduct } from '@/components/staff/ProductEditor';
import { StockMovementForm } from '@/components/staff/StockMovementForm';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getStaffSession, isOwner } from '@/lib/auth';
import { hasConsoleData } from '@/lib/console/demo';
import {
  accessoryShortages,
  productShortages,
  uncountedAccessories,
} from '@/lib/console/shortages';
import {
  getAccessoryStock,
  getProductStock,
  type AccessoryStock,
  type ProductStock,
} from '@/lib/console/stock';
import { fromIsoDate } from '@/lib/datetime';
import { usePrice } from '@/lib/use-price';

/**
 * Stock — one screen, two panels.
 *
 * Products and accessories keep separate tables because they behave differently: a product is
 * consumed and an accessory is rented and comes back. But "what am I short of" is a single
 * question, and splitting it across two screens is how a salon runs out of something it owns.
 * So the shortage summary at the top unions both, and the panels below explain each half.
 *
 * The union happens here rather than in `stock_alerts()`, which reads `product_stock` alone. That
 * is the honest place for it: an accessory shortage is not a low count, it is *every one of them
 * out today*, which is a different predicate over different tables and does not belong grafted
 * onto a reorder-level query.
 *
 * Who may do what follows RLS, not this file. Reception records movements — they are the ones who
 * notice a bottle running out. Only an owner adds a product or sets what it costs.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.stock' });
  return { title: t('title') };
}

/** `2026-08-16` in Africa/Algiers, wherever this rendered. */
function salonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
}

function toEditable(product: ProductStock): EditableProduct {
  return {
    slug: product.slug,
    name: product.name,
    brand: product.brand ?? '',
    line: product.line ?? '',
    unit: product.unit,
    unitCost: product.unitCost === null ? '' : String(product.unitCost / 100),
    reorderLevel: product.reorderLevel === null ? '' : String(product.reorderLevel),
    isActive: true,
  };
}

/** Trailing zeros off a derived numeric: `5.50` is 5.5, `3.00` is 3. */
const formatQuantity = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(INTL_TAG[locale], { maximumFractionDigits: 2 }).format(value);

export default async function StockPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.stock' });
  const today = salonToday();

  const session = await getStaffSession();
  const canManage = isOwner(session);

  const [products, accessories] = await Promise.all([
    getProductStock(),
    getAccessoryStock(today),
  ]);

  // The rules themselves live in `shortages.ts`, pure and tested — see the note on uncounted zero.
  const lowProducts = productShortages(products);
  const lowAccessories = accessoryShortages(accessories);
  const shortages = lowProducts.length + lowAccessories.length;
  const uncounted = uncountedAccessories(accessories);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">{t('subtitle')}</p>

        {!hasConsoleData() ? (
          <p
            role="status"
            className="mt-2 rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
          >
            {t('notConfigured')}
          </p>
        ) : null}
      </header>

      {/* The one thing worth reading first: both halves of "what am I short of", in one line. */}
      {shortages > 0 ? (
        <section
          aria-labelledby="stock-shortages"
          className="flex flex-col gap-2 rounded-[20px] border border-rose-soft/55 bg-tint/60 px-5 py-4"
        >
          <h2
            id="stock-shortages"
            className="text-[11px] uppercase tracking-[.16em] text-rose-deep"
          >
            {t('shortagesTitle', { count: shortages })}
          </h2>
          <ul className="flex flex-col gap-1 text-[13px] leading-[1.7] text-ink-2">
            {lowProducts.map((product) => (
              <li key={product.slug}>
                {t('shortProduct', {
                  name: product.name,
                  onHand: formatQuantity(product.onHand, locale),
                  unit: t(`units.${product.unit}`),
                  threshold: formatQuantity(product.reorderLevel ?? 0, locale),
                })}
              </li>
            ))}
            {lowAccessories.map((accessory) => (
              <li key={accessory.slug}>{t('shortAccessory', { name: accessory.name })}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── products ────────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="stock-products" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2
              id="stock-products"
              className="font-display text-[21px] font-light text-charcoal"
            >
              {t('productsTitle')}
            </h2>
            <p className="max-w-[70ch] text-[13px] leading-[1.7] text-ink-2">
              {t('productsLead')}
            </p>
          </div>
          {canManage ? <ProductEditor trigger={t('addProduct')} /> : null}
        </div>

        {products.length === 0 ? (
          <p className="rounded-[18px] border border-line bg-white px-5 py-6 text-[13px] leading-[1.7] text-ink-2">
            {canManage ? t('emptyProductsOwner') : t('emptyProducts')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  <Th>{t('product')}</Th>
                  <Th>{t('onHand')}</Th>
                  <Th>{t('threshold')}</Th>
                  <Th>{t('unitCost')}</Th>
                  <Th>{t('lastMovement')}</Th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <ProductRow
                    key={product.slug}
                    product={product}
                    locale={locale}
                    canManage={canManage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── accessories ─────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="stock-accessories" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="stock-accessories"
            className="font-display text-[21px] font-light text-charcoal"
          >
            {t('accessoriesTitle')}
          </h2>
          <p className="max-w-[70ch] text-[13px] leading-[1.7] text-ink-2">
            {t('accessoriesLead')}
          </p>
        </div>

        {uncounted > 0 ? (
          <p
            role="status"
            className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
          >
            {t('uncountedNotice', { count: uncounted })}
          </p>
        ) : null}

        {accessories.length === 0 ? (
          <p className="rounded-[18px] border border-line bg-white px-5 py-6 text-[13px] leading-[1.7] text-ink-2">
            {t('emptyAccessories')}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accessories.map((accessory) => (
              <AccessoryCard
                key={accessory.slug}
                accessory={accessory}
                canManage={canManage}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-3 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe"
    >
      {children}
    </th>
  );
}

function ProductRow({
  product,
  locale,
  canManage,
}: {
  product: ProductStock;
  locale: Locale;
  canManage: boolean;
}) {
  const price = usePrice();
  const t = useTranslations('console.stock');

  return (
    <tr className="border-b border-line/70 align-top">
      <td className="px-3 py-2.5 text-charcoal">
        {product.name}
        <span className="block text-[12px] text-taupe">
          {[product.brand, product.line ? t(`lines.${product.line}`) : t('lineShared')]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <span className={product.needsReorder ? 'text-rose-dark' : 'text-ink-2'}>
          {formatQuantity(product.onHand, locale)} {t(`units.${product.unit}`)}
        </span>
      </td>

      {/* No threshold is not "fine" — it is nobody having set one, and it says so. */}
      <td className="px-3 py-2.5 text-ink-2">
        {product.reorderLevel === null ? (
          <span className="text-taupe">{t('noThreshold')}</span>
        ) : (
          formatQuantity(product.reorderLevel, locale)
        )}
      </td>

      {/* An em dash, never a zero — a zero cost reports a 100% margin (§6). */}
      <td className="px-3 py-2.5 text-ink-2">
        {product.unitCost === null ? '—' : price({ kind: 'fixed', amount: product.unitCost })}
      </td>

      <td className="px-3 py-2.5 text-ink-2">
        {product.lastMovementOn
          ? fromIsoDate(product.lastMovementOn).toLocaleDateString(INTL_TAG[locale], {
              day: 'numeric',
              month: 'short',
            })
          : '—'}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-col items-start gap-2">
          <details className="w-full">
            <summary className="w-fit cursor-pointer list-none rounded-full border border-rose-soft/45 px-3 py-1 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep">
              {t('movement')}
            </summary>
            <div className="pt-3">
              <StockMovementForm
                productSlug={product.slug}
                productName={product.name}
                unit={product.unit}
              />
            </div>
          </details>

          {canManage ? (
            <ProductEditor product={toEditable(product)} trigger={t('editProduct')} />
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function AccessoryCard({
  accessory,
  canManage,
}: {
  accessory: AccessoryStock;
  canManage: boolean;
}) {
  const t = useTranslations('console.stock');
  const counted = accessory.stockTotal > 0;

  return (
    <li className="flex flex-col gap-3 rounded-[20px] border border-line bg-white px-5 py-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-[19px] font-light text-charcoal">{accessory.name}</h3>
        <p className="text-[13px] leading-[1.7] text-ink-2">
          {counted
            ? t('accessoryCounted', {
                owned: accessory.stockTotal,
                out: accessory.outOnLoan,
                available: Math.max(accessory.stockTotal - accessory.outOnLoan, 0),
              })
            : /* Zero is the absence of a count, not an empty rail. */
              t('accessoryUncounted', { out: accessory.outOnLoan })}
        </p>
      </div>

      {canManage ? (
        <AccessoryStockForm slug={accessory.slug} stockTotal={accessory.stockTotal} />
      ) : null}
    </li>
  );
}
