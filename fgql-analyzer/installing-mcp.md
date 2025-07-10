# Installing FGQL Analyzer MCP Server

This guide walks you through installing and configuring the FGQL Analyzer as an MCP (Model Context Protocol) server for use with Claude Desktop or other MCP-compatible AI assistants.

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Claude Desktop (or another MCP-compatible client)

## Installation Methods

### Method 1: Global Installation (Recommended)

1. Install the FGQL Analyzer globally:
```bash
npm install -g fgql-analyzer
```

2. Verify installation:
```bash
fgql-analyzer-mcp --version
```

### Method 2: Local Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/fgql-analyzer.git
cd fgql-analyzer
```

2. Install dependencies:
```bash
npm install
```

3. Link the package locally:
```bash
npm link
```

### Method 3: Direct from npm (When Published)

```bash
npm install -g @your-scope/fgql-analyzer
```

## Configuration

### For Claude Desktop

1. Open Claude Desktop settings
2. Navigate to the MCP servers configuration
3. Add the FGQL Analyzer server configuration

#### If installed globally:
```json
{
  "mcpServers": {
    "fgql-analyzer": {
      "command": "fgql-analyzer-mcp"
    }
  }
}
```

#### If installed locally:
```json
{
  "mcpServers": {
    "fgql-analyzer": {
      "command": "node",
      "args": ["/path/to/fgql-analyzer/src/mcp-server.js"]
    }
  }
}
```

#### Using npx (no installation required):
```json
{
  "mcpServers": {
    "fgql-analyzer": {
      "command": "npx",
      "args": ["fgql-analyzer-mcp"]
    }
  }
}
```

### Configuration File Locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## Verification

### 1. Test the MCP Server Directly

Run the test script to verify the server is working:

```bash
# If installed globally
fgql-analyzer-mcp

# Or using the test script
node test-mcp.js
```

You should see output indicating the server is running and listing available tools.

### 2. Test in Claude Desktop

1. Restart Claude Desktop after adding the configuration
2. In a new conversation, you should see the FGQL Analyzer tools available
3. Try a simple command:
   - "Use the fgql-analyzer to list analyzed schemas"
   - "Analyze the schema file at ./examples/products-schema.graphql"

## Troubleshooting

### Server not starting

1. Check Node.js version:
```bash
node --version  # Should be 18.0.0 or higher
```

2. Verify installation:
```bash
which fgql-analyzer-mcp  # Should show the path
```

3. Test manually:
```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' | fgql-analyzer-mcp
```

### Tools not appearing in Claude

1. Ensure Claude Desktop is fully closed and restarted
2. Check the configuration file syntax (valid JSON)
3. Check Claude Desktop logs for errors
4. Try the absolute path to the executable

### Permission errors

On Unix-like systems, ensure the script is executable:
```bash
chmod +x $(which fgql-analyzer-mcp)
```

### Cache location issues

The analyzer stores cache in `~/.fgql-analyzer/cache/`. Ensure this directory is writable:
```bash
mkdir -p ~/.fgql-analyzer/cache
chmod 755 ~/.fgql-analyzer/cache
```

## Advanced Configuration

### Using with Docker

Create a Dockerfile:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm link
CMD ["fgql-analyzer-mcp"]
```

Build and run:
```bash
docker build -t fgql-analyzer-mcp .
docker run -i fgql-analyzer-mcp
```

### Environment Variables

You can set environment variables to customize behavior:

```bash
# Set custom cache directory
export FGQL_CACHE_DIR=/custom/path/to/cache

# Enable debug logging
export DEBUG=fgql-analyzer:*
```

## Updating

### Global Installation
```bash
npm update -g fgql-analyzer
```

### Local Installation
```bash
cd /path/to/fgql-analyzer
git pull
npm install
```

## Uninstalling

### Global Installation
```bash
npm uninstall -g fgql-analyzer
```

### Local Installation
```bash
npm unlink fgql-analyzer
```

Then remove the configuration from Claude Desktop's settings.

## Getting Help

- Check the [MCP_USAGE.md](./MCP_USAGE.md) for usage examples
- Review the [README.md](./README.md) for general documentation
- Open an issue on GitHub for bugs or feature requests

## Security Notes

- The MCP server runs with the same permissions as the user
- It can only access files that the user can access
- Schema analysis results are cached locally in the user's home directory
- No data is sent to external services