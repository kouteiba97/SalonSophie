import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Phase 1 serves branded local placeholders; Phase 2 swaps in Supabase Storage.
    formats: ['image/avif', 'image/webp'],
  },
};

export default withNextIntl(nextConfig);
