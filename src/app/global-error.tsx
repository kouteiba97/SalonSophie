'use client';

import { BUSINESS } from '@/data/business';

/**
 * The last resort: an error in the root layout itself.
 *
 * Every other failure is caught by `(site)/error.tsx` or the atelier's boundary, which render
 * inside the layout and keep the header, the fonts and the language. This one replaces the whole
 * document, so it has to carry its own `<html>` and `<body>` — and it cannot use next-intl,
 * because the provider that would translate it is part of what failed.
 *
 * So it is written in French, the default locale, with no dependencies beyond the phone number.
 * Styles are inline for the same reason: if the layout did not render, the stylesheet may not
 * have loaded either, and a fallback that depends on the thing that broke is not a fallback.
 *
 * The WhatsApp link is the point of the page. A client who came to book and hit a blank screen
 * should still be one tap from the salon — that is the channel the business actually runs on, and
 * a booking made by message is worth more than an apology.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr" dir="ltr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7f3f0',
          color: '#2e2a28',
          fontFamily: 'Georgia, "Times New Roman", serif',
          padding: '24px',
        }}
      >
        <main style={{ maxWidth: '30rem', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', letterSpacing: '6px', color: '#71645c', margin: 0 }}>
            N&amp;S
          </p>

          <h1 style={{ fontSize: '28px', fontWeight: 300, margin: '18px 0 10px' }}>
            Une erreur est survenue
          </h1>

          <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#5c534e', margin: '0 0 26px' }}>
            Le site n’a pas pu s’afficher. Réessayez dans un instant — ou écrivez-nous sur
            WhatsApp&nbsp;: nous prenons votre rendez-vous à la main, tout de suite.
          </p>

          <div
            style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                cursor: 'pointer',
                border: 0,
                borderRadius: '999px',
                background: '#826775',
                color: '#fff',
                padding: '13px 26px',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            >
              Réessayer
            </button>

            <a
              href={`https://wa.me/${BUSINESS.phoneInternational.replace(/\D/g, '')}`}
              style={{
                borderRadius: '999px',
                background: '#25d366',
                color: '#2e2a28',
                padding: '13px 26px',
                fontSize: '14px',
                textDecoration: 'none',
                fontFamily: 'inherit',
              }}
            >
              WhatsApp {BUSINESS.phone}
            </a>
          </div>

          {/*
            The digest is the only handle on what actually happened: the message itself is
            withheld from the browser in production, and this string is what matches the entry in
            the server log.
          */}
          {error.digest ? (
            <p style={{ fontSize: '11px', color: '#71645c', marginTop: '28px' }}>
              Référence&nbsp;: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
