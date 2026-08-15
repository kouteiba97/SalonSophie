import { addon, fixed, free, from, range } from '@/lib/money';
import { TODO_SERVICE_DURATION } from '@/lib/todo';
import type { Service, ServiceCategory } from './types';

/**
 * The real published tariff — BUILD_BRIEF §6. Prices in DZD, stored as centimes.
 *
 * This is NOT the design file's SERVICES array. That array was prototype filler whose numbers
 * contradict the published tariff (it priced "Balayage & Ombré" at 7 500 when the real floor is
 * 16 000) and invented a duration for every line. Durations are unknown for all 55 services and
 * render as an em dash until Nour or Sophie supplies them.
 */

export const CATEGORIES: ServiceCategory[] = [
  { slug: 'coiffure', name: 'Coiffure', order: 1 },
  { slug: 'soins-capillaires', name: 'Soins Capillaires', order: 2 },
  { slug: 'soin-de-visage', name: 'Soin de Visage', order: 3 },
  { slug: 'nails', name: 'Nails', order: 4 },
  { slug: 'pedicure', name: 'Pédicure', order: 5 },
  { slug: 'extension-de-cils', name: 'Extension de Cils', order: 6 },
  { slug: 'epilation', name: 'Épilation', order: 7 },
  { slug: 'massage', name: 'Massage', order: 8 },
];

const d = TODO_SERVICE_DURATION;

export const SERVICES: Service[] = [
  // ── Coiffure ────────────────────────────────────────────────────────────────────────────
  { slug: 'coupe', categorySlug: 'coiffure', name: 'Coupe', price: fixed(700), duration: d },
  { slug: 'coupe-brushing-courts', categorySlug: 'coiffure', name: 'Coupe + brushing courts', price: fixed(1200), duration: d },
  { slug: 'coupe-brushing-longs', categorySlug: 'coiffure', name: 'Coupe + brushing longs', price: fixed(1500), duration: d },
  { slug: 'brushing-courts', categorySlug: 'coiffure', name: 'Brushing courts', price: fixed(1000), duration: d },
  { slug: 'brushing-mi-longs', categorySlug: 'coiffure', name: 'Brushing mi-longs', price: fixed(1200), duration: d },
  { slug: 'brushing-longs', categorySlug: 'coiffure', name: 'Brushing longs', price: fixed(1500), duration: d },
  { slug: 'brushing-tres-tres-longs', categorySlug: 'coiffure', name: 'Brushing très très longs', price: fixed(2000), duration: d },

  // ── Soins Capillaires ───────────────────────────────────────────────────────────────────
  { slug: 'soins-capillaires', categorySlug: 'soins-capillaires', name: 'Soins capillaires', price: range(14000, 35000), duration: d },
  { slug: 'ccrp', categorySlug: 'soins-capillaires', name: 'CCRP', price: from(6000), duration: d },
  { slug: 'balayage', categorySlug: 'soins-capillaires', name: 'Balayage', price: from(16000), duration: d },

  // ── Soin de Visage ──────────────────────────────────────────────────────────────────────
  { slug: 'soin-visage-simple', categorySlug: 'soin-de-visage', name: 'Soin de visage simple', price: fixed(3500), duration: d },
  { slug: 'soin-visage-profond', categorySlug: 'soin-de-visage', name: 'Soin de visage profond', price: fixed(5000), duration: d },
  { slug: 'hydra-facial', categorySlug: 'soin-de-visage', name: 'Hydra Facial', price: fixed(8000), duration: d },
  { slug: 'soin-des-mains', categorySlug: 'soin-de-visage', name: 'Soin des mains', price: fixed(2500), duration: d },

  // ── Nails ───────────────────────────────────────────────────────────────────────────────
  { slug: 'pose-capsule', categorySlug: 'nails', name: 'Pose capsule', price: fixed(4000), duration: d },
  { slug: 'gel-ongle-naturel', categorySlug: 'nails', name: 'Gel sur ongle naturel', price: fixed(3500), duration: d },
  { slug: 'verni-semi-permanent', categorySlug: 'nails', name: 'Verni semi-permanent', price: fixed(2500), duration: d },
  { slug: 'remplissage', categorySlug: 'nails', name: 'Remplissage', price: fixed(3500), duration: d },
  { slug: 'depose-manucure-russe', categorySlug: 'nails', name: 'Dépose + manucure russe', price: fixed(2000), duration: d },
  { slug: 'manucure-russe', categorySlug: 'nails', name: 'Manucure russe', price: fixed(1000), duration: d },
  { slug: 'french-pose-capsule', categorySlug: 'nails', name: 'French pose capsule', price: fixed(4500), duration: d },
  { slug: 'french-gel-ongle-naturel', categorySlug: 'nails', name: 'French gel sur ongle naturel', price: fixed(4000), duration: d },
  { slug: 'babyboomer', categorySlug: 'nails', name: 'Babyboomer', price: fixed(5000), duration: d },
  { slug: 'deco', categorySlug: 'nails', name: 'Déco', price: addon(500), duration: d, note: 'supplement' },

  // ── Pédicure ────────────────────────────────────────────────────────────────────────────
  { slug: 'pedicure-capsule', categorySlug: 'pedicure', name: 'Capsule', price: fixed(3500), duration: d },
  { slug: 'pedicure-gel-ongle-naturel', categorySlug: 'pedicure', name: 'Gel sur ongle naturel', price: fixed(3000), duration: d },
  { slug: 'pedicure-semi-permanent', categorySlug: 'pedicure', name: 'Semi-permanent', price: fixed(2500), duration: d },
  { slug: 'pedicure-soin-sans-paraffine', categorySlug: 'pedicure', name: 'Soin sans paraffine', price: fixed(3000), duration: d },
  { slug: 'pedicure-soin-avec-paraffine', categorySlug: 'pedicure', name: 'Soin avec paraffine', price: fixed(3500), duration: d },
  { slug: 'pedicure-peeling', categorySlug: 'pedicure', name: 'Peeling', price: fixed(5000), duration: d },

  // ── Extension de Cils ───────────────────────────────────────────────────────────────────
  { slug: 'cils-effet-naturel', categorySlug: 'extension-de-cils', name: 'Effet naturel', price: fixed(4000), duration: d },
  { slug: 'cils-effet-naturel-mixte', categorySlug: 'extension-de-cils', name: 'Effet naturel mixte', price: fixed(5000), duration: d },
  { slug: 'cils-effet-mixte', categorySlug: 'extension-de-cils', name: 'Effet mixte', price: fixed(6500), duration: d },
  { slug: 'cils-effet-russe', categorySlug: 'extension-de-cils', name: 'Effet russe', price: fixed(8000), duration: d },
  { slug: 'rehaussement', categorySlug: 'extension-de-cils', name: 'Rehaussement', price: fixed(3500), duration: d },
  { slug: 'rehaussement-teinture', categorySlug: 'extension-de-cils', name: 'Rehaussement + teinture', price: fixed(4500), duration: d },
  { slug: 'brow-lifting', categorySlug: 'extension-de-cils', name: 'Brow lifting', price: fixed(3500), duration: d },
  { slug: 'brow-lifting-teinture', categorySlug: 'extension-de-cils', name: 'Brow lifting + teinture', price: fixed(4500), duration: d },

  // ── Épilation ───────────────────────────────────────────────────────────────────────────
  { slug: 'epilation-levre-superieure', categorySlug: 'epilation', name: 'Lèvre supérieure', price: fixed(200), duration: d },
  { slug: 'epilation-sourcils', categorySlug: 'epilation', name: 'Sourcils', price: fixed(600), duration: d },
  { slug: 'epilation-aisselles', categorySlug: 'epilation', name: 'Aisselles', price: fixed(600), duration: d },
  { slug: 'epilation-demi-bras', categorySlug: 'epilation', name: 'Demi-bras', price: fixed(1000), duration: d },
  { slug: 'epilation-visage-sans-sourcils', categorySlug: 'epilation', name: 'Visage sans sourcils', price: fixed(1000), duration: d },
  { slug: 'epilation-ventre', categorySlug: 'epilation', name: 'Ventre', price: fixed(1000), duration: d },
  { slug: 'epilation-demi-jambes', categorySlug: 'epilation', name: 'Demi-jambes', price: fixed(1000), duration: d },
  { slug: 'epilation-cuisse', categorySlug: 'epilation', name: 'Cuisse', price: fixed(1000), duration: d },
  { slug: 'epilation-bras', categorySlug: 'epilation', name: 'Bras', price: fixed(1800), duration: d },
  { slug: 'epilation-jambes', categorySlug: 'epilation', name: 'Jambes', price: fixed(2000), duration: d },
  { slug: 'epilation-fessier', categorySlug: 'epilation', name: 'Fessier', price: fixed(3000), duration: d },
  { slug: 'epilation-dos', categorySlug: 'epilation', name: 'Dos', price: fixed(4000), duration: d },
  { slug: 'epilation-maillot', categorySlug: 'epilation', name: 'Maillot', price: fixed(4000), duration: d },

  // ── Massage ─────────────────────────────────────────────────────────────────────────────
  { slug: 'massage-corps-complet', categorySlug: 'massage', name: 'Corps complet', price: fixed(7000), duration: d },
  { slug: 'massage-ventre-dos', categorySlug: 'massage', name: 'Ventre et dos', price: fixed(4000), duration: d },
  { slug: 'massage-cuisses-mollets', categorySlug: 'massage', name: 'Cuisses et mollets', price: fixed(4000), duration: d },
  { slug: 'massage-visage', categorySlug: 'massage', name: 'Visage', price: free(), duration: d, note: 'withAnyMassage' },
];

export const servicesByCategory = (categorySlug: string): Service[] =>
  SERVICES.filter((s) => s.categorySlug === categorySlug);

export const findService = (slug: string): Service | undefined =>
  SERVICES.find((s) => s.slug === slug);

export const findCategory = (slug: string): ServiceCategory | undefined =>
  CATEGORIES.find((c) => c.slug === slug);
