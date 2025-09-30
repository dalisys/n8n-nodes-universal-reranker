# Universal Reranker (n8n Community Node)

Universal Reranker provides document reranking capabilities for n8n workflows. It supports OpenAI-compatible rerank endpoints (vLLM, LocalAI, Infinity, custom) and Cohere Rerank API. The package includes two specialized nodes designed for different use cases.

## Nodes

### Universal Reranker Provider
AI provider node that connects to vector stores (like PGVector) to rerank retrieved documents. The vector store calls this node automatically during retrieval operations.

### Universal Reranker (Flow)
Regular workflow node for reranking document arrays in your n8n flows. You provide the query and document field, and it outputs reranked results.

## Installation

### Option A - Community Nodes (Recommended)
1. In n8n: Settings → Community Nodes → Install
2. Search for "universal reranker" or use package name `n8n-nodes-universal-reranker`
3. Restart n8n when prompted

### Option B - Self-Hosted Installation
**Local Installation:**
```bash
cd ~/.n8n/custom
npm install n8n-nodes-universal-reranker
```

**Docker Installation:**
```bash
# Mount custom folder and install inside container
docker exec -it n8n npm install n8n-nodes-universal-reranker
```
Restart n8n after installation.

## Configuration

### Service Options
- **OpenAI-Compatible**: Works with vLLM, LocalAI, Infinity, and custom endpoints
  - Set Endpoint URL (e.g., `http://localhost:7997/rerank`)
  - Set Model name (e.g., `BAAI/bge-reranker-v2-m3`)
- **Cohere**: Uses Cohere's rerank API
  - Select from predefined models or choose "Custom" for specific models
  - Requires Cohere API credentials

### Parameters
- **Top K**: Maximum number of documents to return after reranking
- **Threshold**: Minimum relevance score (0-1) for returned documents
- **Include Original Scores**: Whether to preserve original document scores
- **Enable Caching**: Cache reranking results to improve performance for repeated queries
- **Cache TTL**: Time to live for cached results in minutes (1-60, default: 5)
- **Enable Custom Templates**: For special models like Qwen3 Reranker (see [TEMPLATES.md](TEMPLATES.md))

### Cohere Models
- `rerank-v3.5` (default)
- `rerank-english-v3.0`
- `rerank-multilingual-v3.0`
- Custom: Enter any specific Cohere model name

## Caching

Both nodes support optional caching to reduce API calls and improve performance. Caching is disabled by default and can be enabled per node.


## Documentation

- **[EXAMPLES.md](EXAMPLES.md)** - Usage examples and workflow configurations
- **[TEMPLATES.md](TEMPLATES.md)** - Custom template guide for special models (Qwen3, etc.)

## Docker Networking

When n8n runs in Docker, use `host.docker.internal` to access services on your host:
- Infinity: `http://host.docker.internal:7997/rerank`
- vLLM: `http://host.docker.internal:8000/v1/rerank`
- LocalAI: `http://host.docker.internal:8080/v1/rerank`

## Troubleshooting

### Common Issues

**"No documents found in field"**
- Verify your `documentsField` parameter matches the actual field name
- Ensure the field contains an array of documents

**"API Error (404)"**
- Check that your endpoint URL is correct
- Verify your reranker service is running and accessible
- Test the endpoint directly with curl

**"Request failed: connect ECONNREFUSED"**
- Ensure your reranker service is accessible from n8n
- Check Docker network configuration if using containers
- Verify firewall/security group settings

### Debug Mode

Enable debug logging in n8n to see detailed error messages:
```bash
export N8N_LOG_LEVEL=debug
```

## Document Format

The nodes expect documents in one of these formats:
- `pageContent` field (LangChain format)
- `text` field
- `content` field
- `document` field
- If none found, the entire document object is stringified

Output includes:
- `_rerankScore`: Relevance score from reranking service
- `_originalIndex`: Original position in input array
- `_originalScore`: Original document score (if `includeOriginalScores` is true)

## Development

### Testing
The package includes a comprehensive test suite with 78+ tests covering:
- Core reranking functionality
- Caching behavior
- Error handling and edge cases
- Both node types (Provider and Flow)

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Build and test
pnpm run prepublishOnly
```

## Contributing

Contributions are welcome!


## License

MIT License