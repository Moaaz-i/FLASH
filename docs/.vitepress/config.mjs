import { defineConfig } from "vitepress";

export default defineConfig({
  title: "FLASH DB",
  description: "Zero-knowledge encrypted intelligence database — local-first, AI-native, server-blind",
  base: "/FLASH/",
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "FLASH DB",
    nav: [
      {
        text: "📖 Guide",
        items: [
          { text: "Positioning & Identity", link: "/guide/positioning" },
          { text: "Why Server-Blind AI", link: "/guide/why-server-blind-ai" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Universal Foundations", link: "/guide/foundations" },
          { text: "Architecture & Zero-Copy", link: "/guide/architecture" },
          { text: "TypeScript Support", link: "/guide/typescript" },
          { text: "Client-Server Daemon", link: "/guide/client-server" },
          { text: "Web GUI Dashboard", link: "/guide/gui-dashboard" },
          { text: "ETL & Data Migration", link: "/guide/etl-data-migration" },
          { text: "Durability & Crash Recovery", link: "/guide/durability" },
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
        text: "⚡ FLASH Exclusive",
        items: [
          { text: "Exclusive Stack Overview", link: "/guide/flash-exclusive" },
          { text: "Private RAG & Agent Memory", link: "/guide/private-rag" },
          { text: "LangChain Integration", link: "/guide/langchain-integration" },
          { text: "Trust & Compliance Tools", link: "/guide/trust-compliance" },
          { text: "Portable Bundles & Sync", link: "/guide/portable-sync" },
          { text: "FLASH Wire Protocol", link: "/guide/flash-wire" },
        ],
      },
      {
        text: "🧠 AI & Next-Gen",
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
        text: "🌐 Distributed & Storage",
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
        text: "🛡️ Security",
        items: [
          {
            text: "Zero-Knowledge Security",
            link: "/guide/zero-knowledge-security",
          },
          {
            text: "Security, RBAC & Audit",
            link: "/guide/security-compliance",
          },
          { text: "Key Rotation & ORE", link: "/guide/key-rotation-ore" },
          { text: "Encrypted Fuzzy Search", link: "/guide/fuzzy-search" },
          { text: "Homomorphic Math ($sum)", link: "/guide/homomorphic-math" },
          { text: "Post-Quantum Crypto (PQC)", link: "/guide/post-quantum" },
          { text: "Merkle Integrity Proofs", link: "/guide/merkle-integrity" },
          { text: "Schema Validation Rules", link: "/guide/schema-validation" },
        ],
      },
      {
        text: "⚡ API & Benchmarks",
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
            { text: "Positioning & Identity", link: "/guide/positioning" },
            { text: "Why Server-Blind AI", link: "/guide/why-server-blind-ai" },
            { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Universal Foundations", link: "/guide/foundations" },
            { text: "TypeScript Support", link: "/guide/typescript" },
            { text: "Architecture & Zero-Copy", link: "/guide/architecture" },
            { text: "Client-Server & Daemon", link: "/guide/client-server" },
            { text: "Web GUI Dashboard", link: "/guide/gui-dashboard" },
            { text: "Bulk ETL & Migration", link: "/guide/etl-data-migration" },
            { text: "Durability & Crash Recovery", link: "/guide/durability" },
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
              text: "Zero-Knowledge Security",
              link: "/guide/zero-knowledge-security",
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
            { text: "Post-Quantum Crypto (PQC)", link: "/guide/post-quantum" },
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
    socialLinks: [{ icon: "github", link: "https://github.com" }],
    footer: {
      message: "Released under the Apache 2.0 License.",
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
