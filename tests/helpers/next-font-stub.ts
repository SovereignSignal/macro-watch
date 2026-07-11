/**
 * Vitest stand-in for next/font/google. The real module is a Next.js
 * compiler transform (fonts are downloaded and self-hosted at build time);
 * under vitest we only need the shape: a loader returning class/variable
 * names.
 */
const loader = () => ({ className: 'font-stub', variable: 'font-stub-var', style: {} });

export const Fraunces = loader;
export const IBM_Plex_Mono = loader;
