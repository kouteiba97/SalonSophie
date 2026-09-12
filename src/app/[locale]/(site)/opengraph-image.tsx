import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { hasLocale } from 'next-intl';
import { routing, type Locale } from '@/i18n/routing';

/**
 * The card that appears when somebody sends the salon a link.
 *
 * Worth more here than on most sites: §1 says the primary client arrives from an Instagram reel,
 * and the channel that actually carries a booking in Algeria is WhatsApp. Every share so far has
 * rendered as a bare grey link, which on WhatsApp looks less like a salon than like a link
 * somebody is not sure about.
 *
 * Drawn rather than photographed, because there are no real photographs yet and a stock image of
 * another salon is the one thing the brief refuses outright. Every word on it is a fact already
 * on the page — the name, the tagline, the city — so nothing is invented to fill the space.
 *
 * The typeface is the renderer's default, not Cormorant. Satori cannot read woff2 and woff2 is
 * all the design bundle contained, so matching the brand face would mean shipping a second copy
 * of each font in another format for one image. The colours are the real tokens, which is what
 * makes it recognisable at thumbnail size.
 *
 * The Arabic card carries no Arabic. Satori's shaper refuses the substitution table these glyphs
 * need — "lookupType: 5 - substFormat: 3 is not yet supported" — and the route returned a 500, so
 * an `og:image` tag pointed at an image that could not exist. A broken preview is worse than a
 * plain one: WhatsApp renders the link with a torn thumbnail rather than no thumbnail.
 *
 * So every locale gets the same card, in the brand's own Latin: the wordmark is "N&S" in all
 * three, and "The Sisters · Constantine" is how the salon writes itself everywhere including
 * `ar.json`'s own `brand.name`. Only the description line, which is the one genuinely
 * translated sentence, is dropped where it cannot be drawn. Shipping a second Arabic font in ttf
 * purely for this would cost more than the line is worth.
 */

export const alt = 'The Sisters N&S — Constantine';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The tokens, copied rather than imported: this renders outside the CSS pipeline.
const CREAM = '#F7F3F0';
const ROSE_DEEP = '#8B6F7D';
const CHAMPAGNE = '#D4B896';
const CHARCOAL = '#2E2A28';
const TAUPE = '#A08D82';

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const safe: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;

  // Latin for every locale — see the note above on Satori and Arabic shaping.
  const brand = await getTranslations({ locale: routing.defaultLocale, namespace: 'brand' });
  const arabic = safe === 'ar';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: CREAM,
          // The design's warmth, as a wash rather than a photograph.
          backgroundImage:
            'linear-gradient(135deg, #FBF8F7 0%, #F3EAE7 55%, #EBD8CF 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 8 }}>
          <div style={{ width: 54, height: 1, background: CHAMPAGNE }} />
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              letterSpacing: 8,
              textTransform: 'uppercase',
              color: TAUPE,
            }}
          >
            {brand('tagline')}
          </div>
          <div style={{ width: 54, height: 1, background: CHAMPAGNE }} />
        </div>

        <div style={{ display: 'flex', fontSize: 128, color: CHARCOAL, lineHeight: 1.1, letterSpacing: -2 }}>
          {brand('name')}
        </div>

        {arabic ? null : (
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              color: ROSE_DEEP,
              marginTop: 22,
              maxWidth: 860,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            {brand('description')}
          </div>
        )}
      </div>
    ),
    size,
  );
}
