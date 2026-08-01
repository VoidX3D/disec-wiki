// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'DISEC Research Wiki',
  tagline: 'Regulating Lethal Autonomous Weapons Systems (LAWS) & Military AI',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  // Set the production url of your site here
  url: 'https://disec-wiki.vercel.app',
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: '/',

  // GitHub pages deployment config.
  organizationName: 'VoidX3D',
  projectName: 'disec-wiki',

  onBrokenLinks: 'warn',

  // All content is plain Markdown (much of it scraped HTML / PDF text) and
  // there are no .mdx files, so parse .md as plain Markdown to avoid MDX JSX
  // errors on things like <https://…> autolinks and stray raw HTML.
  markdown: {
    format: 'md',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
      onBrokenMarkdownImages: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          editUrl: undefined,
        },
        blog: {
          showReadingTime: true,
          routeBasePath: '/news',
          postsPerPage: 20,
          blogSidebarTitle: 'Recent news',
          blogSidebarCount: 20,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
            copyright: `Copyright © ${new Date().getFullYear()} Iran Delegation, Motherland MUN 2026`,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'ignore',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          lastmod: 'date',
          changefreq: 'weekly',
          priority: 0.5,
        },
      }),
    ],
  ],

  plugins: [
    // PWA / offline support.
    [
      '@docusaurus/plugin-pwa',
      {
        debug: false,
        offlineModeActivationStrategies: ['appInstalled', 'queryString', 'standalone', 'mobile'],
        pwaHead: [
          {
            tagName: 'link',
            rel: 'icon',
            href: '/img/favicon.ico',
          },
          {
            tagName: 'meta',
            name: 'theme-color',
            content: '#3b5fe0',
          },
          {
            tagName: 'meta',
            name: 'apple-mobile-web-app-capable',
            content: 'yes',
          },
          {
            tagName: 'meta',
            name: 'apple-mobile-web-app-status-bar-style',
            content: 'black-translucent',
          },
        ],
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'DISEC Research Wiki',
        logo: {
          alt: 'DISEC Research Wiki',
          src: 'img/favicon.ico',
        },
        items: [
          {to: '/position/', label: 'Position', position: 'left'},
          {to: '/iran/', label: 'Iran Delegation', position: 'left'},
          {to: '/committee/', label: 'Committee', position: 'left'},
          {to: '/resources/', label: 'Reference Library', position: 'left'},
          {to: '/news', label: 'News', position: 'left'},
          {to: '/live', label: 'Live News', position: 'left'},
          {
            href: 'https://github.com/VoidX3D/disec-wiki',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Wiki',
            items: [
              {label: 'Position Paper', to: '/position/'},
              {label: 'Iran Delegation', to: '/iran/'},
              {label: 'Committee', to: '/committee/'},
              {label: 'Reference Library', to: '/resources/'},
            ],
          },
          {
            title: 'News',
            items: [
              {label: 'News Archive', to: '/news'},
              {label: 'Live News', to: '/live'},
            ],
          },
          {
            title: 'More',
            items: [
              {label: 'GitHub', href: 'https://github.com/VoidX3D/disec-wiki'},
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Iran Delegation — Motherland Model United Nations 2026. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
