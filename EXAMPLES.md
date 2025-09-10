# Universal Reranker Examples

This file contains detailed examples and use cases for the Universal Reranker nodes.

## Provider Node with PGVector

This example shows how to use the Universal Reranker Provider with a PGVector store for automatic reranking:

```json
{
  "name": "PGVector + Universal Reranker Provider",
  "nodes": [
    {
      "parameters": {},
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger"
    },
    {
      "parameters": {},
      "name": "Embeddings OpenAI",
      "type": "@n8n/n8n-nodes-langchain.embeddingsOpenAi"
    },
    {
      "parameters": {
        "mode": "load",
        "tableName": "n8n_vectors",
        "prompt": "What is n8n?",
        "topK": 3
      },
      "name": "Vector Store (PGVector)",
      "type": "@n8n/n8n-nodes-langchain.vectorStorePGVector"
    },
    {
      "parameters": {
        "service": "openai-compatible",
        "endpoint": "http://localhost:7997/rerank",
        "model": "BAAI/bge-reranker-v2-m3",
        "topK": 3,
        "enableCache": true,
        "cacheTtl": 10
      },
      "name": "Universal Reranker Provider",
      "type": "n8n-nodes-universal-reranker.universalRerankerProvider"
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [["Vector Store (PGVector)"]]
    },
    "Embeddings OpenAI": {
      "ai_embedding": [["Vector Store (PGVector)"]]
    },
    "Universal Reranker Provider": {
      "ai_reranker": [["Vector Store (PGVector)"]]
    }
  }
}
```

## Flow Node Usage

This example demonstrates the Universal Reranker Flow node for manual document reranking:

```json
{
  "name": "Flow Reranker Example",
  "nodes": [
    {
      "parameters": {},
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger"
    },
    {
      "parameters": {
        "mode": "raw",
        "jsonOutput": "{\n  \"query\": \"What is n8n?\",\n  \"documents\": [\n    \"n8n is a workflow automation tool.\",\n    \"Bananas are yellow.\",\n    \"n8n lets you connect apps without code.\"\n  ]\n}"
      },
      "name": "Prepare Input",
      "type": "n8n-nodes-base.set"
    },
    {
      "parameters": {
        "service": "openai-compatible",
        "endpoint": "http://localhost:7997/rerank",
        "model": "BAAI/bge-reranker-v2-m3",
        "query": "={{ $json.query }}",
        "documentsField": "documents",
        "topK": 2,
        "enableCache": true,
        "cacheTtl": 5
      },
      "name": "Universal Reranker",
      "type": "n8n-nodes-universal-reranker.universalRerankerFlow"
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [["Prepare Input"]]
    },
    "Prepare Input": {
      "main": [["Universal Reranker"]]
    }
  }
}
```
