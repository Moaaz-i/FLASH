import { defineConfig } from "vitepress";

export default defineConfig({
  title: "FLASH DB",
  description:
    "First-line privacy while AI is built — server-blind encrypted intelligence database. Default flash-zk is strong; keep the key.",
  base: "/FLASH/",
  appearance: "dark",
  markdown: {
    theme: {
      light: "github-light",
      dark: "nord",
    },
  },
  head: [
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
    ],
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "",
      },
    ],
    [
      "meta",
      {
        name: "theme-color",
        content: "#07090e",
      },
    ],
  ],
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "FLASH DB",
    nav: [
      { text: "Mission", link: "/guide/mission" },
      { text: "Do this first", link: "/guide/do-this-first" },
      { text: "Security ahead", link: "/guide/security-ahead" },
      { text: "What's new", link: "/guide/whats-new" },
      {
        text: "Guide",
        items: [
          { text: "Mission & responsibility", link: "/guide/mission" },
          { text: "Do this first (this week)", link: "/guide/do-this-first" },
          { text: "Security ahead (no surprises)", link: "/guide/security-ahead" },
          { text: "Positioning & Identity", link: "/guide/positioning" },
          { text: "Trust Model & Audit Roadmap", link: "/guide/trust-model" },
          { text: "Why Server-Blind AI", link: "/guide/why-server-blind-ai" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "What's New (1.3.1)", link: "/guide/whats-new" },
          { text: "Release Notes", link: "/guide/release-notes" },
          { text: "Universal Foundations", link: "/guide/foundations" },
          { text: "Buffer Pipeline", link: "/guide/buffer-pipeline" },
          { text: "Architecture & Zero-Copy", link: "/guide/architecture" },
          { text: "TypeScript Support", link: "/guide/typescript" },
          { text: "Client-Server Daemon", link: "/guide/client-server" },
          { text: "Web GUI Dashboard", link: "/guide/gui-dashboard" },
          { text: "ETL & Data Migration", link: "/guide/etl-data-migration" },
          { text: "Durability & Crash Recovery", link: "/guide/durability" },
          {
            text: "Trash & Restore (Undo Delete)",
            link: "/guide/trash-restore",
          },
          {
            text: "Observability & Metrics",
            link: "/guide/observability-metrics",
          },
          { text: "Structured Logging", link: "/guide/structured-logging" },
          {
            text: "Real-Time Infrastructure",
            link: "/guide/realtime-infrastructure",
          },
          { text: "flashsh CLI", link: "/guide/flashsh-cli" },
          { text: "Intelligence Console", link: "/guide/intelligence-console" },
          { text: "Engine Options", link: "/guide/engine-options" },
          { text: "Production Engine", link: "/guide/production-engine" },
        ],
      },
      {
        text: "Exclusive",
        items: [
          { text: "Exclusive Stack Overview", link: "/guide/flash-exclusive" },
          { text: "Private RAG & Agent Memory", link: "/guide/private-rag" },
          {
            text: "LangChain Integration",
            link: "/guide/langchain-integration",
          },
          { text: "Trust & Compliance Tools", link: "/guide/trust-compliance" },
          { text: "Portable Bundles & Sync", link: "/guide/portable-sync" },
          { text: "FLASH Wire Protocol", link: "/guide/flash-wire" },
        ],
      },
      {
        text: "AI",
        items: [
          { text: "🤖 FlashAIDatabase (ChatGPT Suite)", link: "/ai-database" },
          {
            text: "⚡ Vector Quantization (32x RAM)",
            link: "/guide/vector-quantization",
          },
          {
            text: "🌐 Polyglot Query Engine (Any Language)",
            link: "/guide/polyglot-query-engine",
          },
          {
            text: "🤖 Autonomous AI Agent Tools",
            link: "/guide/ai-agent-tools",
          },
          {
            text: "🎯 RAG Context Optimizer (RRF)",
            link: "/guide/rag-context-optimizer",
          },
          { text: "AI Semantic LLM Cache", link: "/guide/ai-semantic-cache" },
          { text: "AI Vector Search (RAG)", link: "/guide/vector-search" },
          {
            text: "HNSW Graph Vector Engine",
            link: "/guide/hnsw-vector-search",
          },
          { text: "Time-Travel & PITR", link: "/guide/time-travel" },
          { text: "SQL Query Engine", link: "/guide/sql-engine" },
          { text: "Graph Database Engine", link: "/guide/graph-database" },
          { text: "Protocols: gRPC & GraphQL", link: "/guide/protocols" },
        ],
      },

      {
        text: "Scale",
        items: [
          { text: "Raft High-Availability", link: "/guide/raft-consensus" },
          {
            text: "Distributed Sharding Ring",
            link: "/guide/distributed-sharding",
          },
          {
            text: "Distributed Locks & CDC",
            link: "/guide/scaling-distributed",
          },
          {
            text: "Spatial, Blob & Browser",
            link: "/guide/storage-spatial-blob",
          },
          { text: "LSM-Tree Compactor", link: "/guide/compactor" },
          { text: "Real-Time Change Streams", link: "/guide/change-streams" },
          {
            text: "ACID Transactions & MVCC",
            link: "/guide/mvcc-transactions",
          },
        ],
      },
      {
        text: "Security",
        items: [
          {
            text: "Zero-Knowledge Security",
            link: "/guide/zero-knowledge-security",
          },
          {
            text: "Trust Model & Audit Roadmap",
            link: "/guide/trust-model",
          },
          {
            text: "Security, RBAC & Audit",
            link: "/guide/security-compliance",
          },
          { text: "Key Rotation & ORE", link: "/guide/key-rotation-ore" },
          { text: "Encrypted Fuzzy Search", link: "/guide/fuzzy-search" },
          { text: "Homomorphic Math ($sum)", link: "/guide/homomorphic-math" },
          {
            text: "Key Hardening (scrypt + ECDH)",
            link: "/guide/post-quantum",
          },
          { text: "Merkle Integrity Proofs", link: "/guide/merkle-integrity" },
          { text: "Schema Validation Rules", link: "/guide/schema-validation" },
        ],
      },
      {
        text: "API",
        items: [
          { text: "FlashClient SDK Reference", link: "/api/flash-client" },
          { text: "FlashCollection & Queries", link: "/api/collection" },
          { text: "Binary Zero-Copy Engine", link: "/api/binary-engine" },
          { text: "Enterprise Scale APIs", link: "/api/enterprise-api" },
          { text: "Performance Benchmarks", link: "/api/benchmarks" },
        ],
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Getting Started & Architecture",
          collapsed: false,
          items: [
            { text: "Mission & responsibility", link: "/guide/mission" },
            { text: "Do this first (this week)", link: "/guide/do-this-first" },
            { text: "Security ahead (no surprises)", link: "/guide/security-ahead" },
            { text: "Positioning & Identity", link: "/guide/positioning" },
            { text: "Trust Model & Audit Roadmap", link: "/guide/trust-model" },
            { text: "Why Server-Blind AI", link: "/guide/why-server-blind-ai" },
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "What's New (1.3.1)", link: "/guide/whats-new" },
            { text: "Release Notes", link: "/guide/release-notes" },
            { text: "Universal Foundations", link: "/guide/foundations" },
            { text: "Buffer Pipeline", link: "/guide/buffer-pipeline" },
            { text: "TypeScript Support", link: "/guide/typescript" },
            { text: "Architecture & Zero-Copy", link: "/guide/architecture" },
            { text: "Client-Server & Daemon", link: "/guide/client-server" },
            { text: "Web GUI Dashboard", link: "/guide/gui-dashboard" },
            { text: "Bulk ETL & Migration", link: "/guide/etl-data-migration" },
            { text: "Durability & Crash Recovery", link: "/guide/durability" },
            {
              text: "Trash & Restore (Undo Delete)",
              link: "/guide/trash-restore",
            },
            {
              text: "Observability & Metrics",
              link: "/guide/observability-metrics",
            },
            { text: "Structured Logging", link: "/guide/structured-logging" },
            {
              text: "Real-Time Infrastructure",
              link: "/guide/realtime-infrastructure",
            },
            { text: "flashsh CLI", link: "/guide/flashsh-cli" },
            {
              text: "Intelligence Console",
              link: "/guide/intelligence-console",
            },
            { text: "Engine Options", link: "/guide/engine-options" },
            { text: "Production Engine", link: "/guide/production-engine" },
          ],
        },
        {
          text: "FLASH Exclusive",
          collapsed: false,
          items: [
            {
              text: "Exclusive Stack Overview",
              link: "/guide/flash-exclusive",
            },
            { text: "Private RAG & Agent Memory", link: "/guide/private-rag" },
            {
              text: "LangChain Integration",
              link: "/guide/langchain-integration",
            },
            {
              text: "Trust & Compliance Tools",
              link: "/guide/trust-compliance",
            },
            { text: "Portable Bundles & Sync", link: "/guide/portable-sync" },
            { text: "FLASH Wire Protocol", link: "/guide/flash-wire" },
          ],
        },
        {
          text: "AI & Next-Gen Engines",
          collapsed: false,
          items: [
            {
              text: "🤖 FlashAIDatabase (ChatGPT Suite)",
              link: "/ai-database",
            },
            {
              text: "⚡ Vector Quantization (32x RAM)",
              link: "/guide/vector-quantization",
            },
            {
              text: "🌐 Polyglot Query Engine (Any Language)",
              link: "/guide/polyglot-query-engine",
            },
            {
              text: "🤖 Autonomous AI Agent Tools",
              link: "/guide/ai-agent-tools",
            },
            {
              text: "🎯 RAG Context Optimizer (RRF)",
              link: "/guide/rag-context-optimizer",
            },
            { text: "AI Semantic LLM Cache", link: "/guide/ai-semantic-cache" },
            { text: "AI Vector Search (RAG)", link: "/guide/vector-search" },
            {
              text: "HNSW Graph Vector Engine",
              link: "/guide/hnsw-vector-search",
            },
            { text: "Time-Travel & PITR", link: "/guide/time-travel" },
            { text: "SQL Query Engine", link: "/guide/sql-engine" },
            { text: "Graph Database Engine", link: "/guide/graph-database" },
            { text: "Protocols: gRPC & GraphQL", link: "/guide/protocols" },
          ],
        },

        {
          text: "Distributed & Storage",
          collapsed: false,
          items: [
            { text: "Raft High-Availability", link: "/guide/raft-consensus" },
            {
              text: "Distributed Sharding Ring",
              link: "/guide/distributed-sharding",
            },
            {
              text: "Distributed Locks & CDC",
              link: "/guide/scaling-distributed",
            },
            {
              text: "Spatial, Blob & Browser Storage",
              link: "/guide/storage-spatial-blob",
            },
            { text: "LSM-Tree Compactor", link: "/guide/compactor" },
            { text: "Real-Time Change Streams", link: "/guide/change-streams" },
            {
              text: "ACID Transactions & MVCC",
              link: "/guide/mvcc-transactions",
            },
          ],
        },
        {
          text: "Zero-Knowledge Security",
          collapsed: false,
          items: [
            {
              text: "Mission & responsibility",
              link: "/guide/mission",
            },
            {
              text: "Do this first (this week)",
              link: "/guide/do-this-first",
            },
            {
              text: "Security ahead (no surprises)",
              link: "/guide/security-ahead",
            },
            {
              text: "Zero-Knowledge Security",
              link: "/guide/zero-knowledge-security",
            },
            {
              text: "Trust Model & Audit Roadmap",
              link: "/guide/trust-model",
            },
            {
              text: "Security, RBAC & Audit",
              link: "/guide/security-compliance",
            },
            { text: "Key Rotation & ORE", link: "/guide/key-rotation-ore" },
            { text: "Encrypted Fuzzy Search", link: "/guide/fuzzy-search" },
            {
              text: "Homomorphic Math ($sum)",
              link: "/guide/homomorphic-math",
            },
            {
              text: "Key Hardening (scrypt + ECDH)",
              link: "/guide/post-quantum",
            },
            {
              text: "Merkle Integrity Proofs",
              link: "/guide/merkle-integrity",
            },
            { text: "Flexible Schema Rules", link: "/guide/schema-validation" },
          ],
        },
      ],

      "/api/": [
        {
          text: "API Reference",
          collapsed: false,
          items: [
            { text: "FlashClient SDK", link: "/api/flash-client" },
            { text: "FlashCollection & Querying", link: "/api/collection" },
            {
              text: "FlashBinary Zero-Copy Engine",
              link: "/api/binary-engine",
            },
            { text: "Enterprise & Scale APIs", link: "/api/enterprise-api" },
            { text: "Performance Benchmarks", link: "/api/benchmarks" },
          ],
        },
      ],
    },
    socialLinks: [
      {
        icon: {
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
        },
        link: "https://github.com/Moaaz-i/FLASH",
        ariaLabel: "GitHub",
      },
    ],
    footer: {
      message: "Zero-knowledge encrypted intelligence · Apache 2.0",
      copyright: "Copyright © 2026 FLASH Team",
    },
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "Search Documentation...",
                buttonAriaLabel: "Search Documentation",
              },
              modal: {
                noResultsText: "No results found",
                resetButtonTitle: "Clear query",
                footer: {
                  selectText: "to select",
                  navigateText: "to navigate",
                  closeText: "to close",
                },
              },
            },
          },
        },
      },
    },
  },
});
