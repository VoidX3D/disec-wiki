// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Sidebar mirroring the original MkDocs navigation:
 *   Position Paper / Iran Delegation / Committee / Reference Library.
 *
 * The individual source documents under references/ are linked from
 * references/index.md rather than enumerated here, exactly like before.
 *
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  wiki: [
    {
      type: 'category',
      label: 'Position Paper',
      collapsible: true,
      collapsed: false,
      items: [
        'position/index',
        'position/strategy',
        'position/talking-points',
        'position/resolutions',
      ],
    },
    {
      type: 'category',
      label: 'Iran Delegation',
      collapsible: true,
      collapsed: false,
      items: [
        'iran/index',
        'iran/profile',
        'iran/military',
        'iran/capabilities',
        'iran/population',
        'iran/economy',
        'iran/treaties',
        'iran/organizations',
        'iran/foreign-relations',
        'iran/alliances',
        'iran/counter-arguments',
      ],
    },
    {
      type: 'category',
      label: 'Committee',
      collapsible: true,
      collapsed: false,
      items: [
        'committee/index',
        {
          type: 'category',
          label: 'Study Guide',
          collapsible: true,
          collapsed: false,
          items: [
            'committee/study-guide/index',
            'committee/study-guide/part-01',
            'committee/study-guide/part-02',
            'committee/study-guide/part-03',
            'committee/study-guide/part-04',
            'committee/study-guide/part-05',
            'committee/study-guide/part-06',
            'committee/study-guide/part-07',
            'committee/study-guide/part-08',
            'committee/study-guide/part-09',
            'committee/study-guide/part-10',
            'committee/study-guide/part-11',
            'committee/study-guide/part-12',
            'committee/study-guide/part-13',
            'committee/study-guide/part-14',
            'committee/study-guide/part-15',
            'committee/study-guide/part-16',
            'committee/study-guide/part-17',
          ],
        },
        'committee/rules-of-procedure',
        'committee/procedure',
        'committee/country-matrix',
        'committee/chair-notice',
        'committee/position-paper-guide',
        'committee/resolution-paper-guide',
        'committee/toc',
      ],
    },
    {
      type: 'category',
      label: 'Data & Statistics',
      collapsible: true,
      collapsed: false,
      items: [
        'data/index',
        'data/factbook',
        'data/demographics',
        'data/development',
        'data/internet',
        'data/poverty-income',
        'data/finance',
        'data/geography',
        'data/indexes',
        'data/military',
        'data/weapons',
        'data/alliances',
        'data/organizations',
        'data/voting',
        'data/nuclear-and-mines',
        'data/history',
        'data/treaties',
        'data/nato',
      ],
    },
    {
      type: 'category',
      label: 'Reference Library',
      collapsible: true,
      collapsed: false,
      items: [
        'resources/index',
        'resources/key-terms',
        'resources/treaties',
        'resources/reports',
        'resources/organizations',
        'references/index',
      ],
    },
  ],
};

export default sidebars;
