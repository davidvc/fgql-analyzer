import { analyzeSchema } from './src/analyzer.js';

// Create a minimal test to check tokenization and parsing
const testSchema = `
type RealtimeSellingListingDetails {
  adsSecondaryDisplayMessages: [String] @requires(fields: "listingReference { listing { items { sellerPrice { fixedPrice { original { amount } } } } } }")
}

directive @requires(fields: String!) on FIELD_DEFINITION
`;

// Manually test the tokenization
const fieldSpec = "listingReference { listing { items { sellerPrice { fixedPrice { original { amount } } } } } }";

// Copy the tokenizeFieldSpec function to test it
function tokenizeFieldSpec(fieldSpec) {
  const tokens = [];
  let current = "";

  for (const char of fieldSpec) {
    if (char === "{" || char === "}") {
      if (current.trim()) {
        // Split by spaces but keep '...' as a single token
        const parts = current.trim().split(/\s+/);
        parts.forEach((part) => {
          if (part !== "...") {
            tokens.push(part);
          }
        });
        current = "";
      }
      tokens.push(char);
    } else if (char === " " || char === "\n" || char === "\t") {
      if (current.trim()) {
        // Skip '...' tokens as they represent field selections we handle elsewhere
        if (current.trim() !== "...") {
          tokens.push(current.trim());
        }
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    // Split by spaces but filter out '...'
    const parts = current.trim().split(/\s+/);
    parts.forEach((part) => {
      if (part !== "...") {
        tokens.push(part);
      }
    });
  }

  return tokens;
}

// Test tokenization
console.log('Field spec:', fieldSpec);
console.log('\nTokens:');
const tokens = tokenizeFieldSpec(fieldSpec);
tokens.forEach((token, i) => console.log(`  ${i}: "${token}"`));

// Now test parseFieldSpec
function parseFieldSpec(fieldSpec) {
  const dependencies = [];
  const tokens = tokenizeFieldSpec(fieldSpec);
  let currentPath = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "{") {
      // Entering nested selection - path already has the field
    } else if (token === "}") {
      // Exiting nested selection
      currentPath.pop();
    } else {
      // Field name
      currentPath.push(token);
      dependencies.push({
        field: token,
        path: [...currentPath].join("."),
      });

      // Check if next token is not '{', meaning this field doesn't have nested selections
      if (i + 1 >= tokens.length || tokens[i + 1] !== "{") {
        currentPath.pop();
      }
    }
  }

  return dependencies;
}

console.log('\n\nParsed dependencies:');
const deps = parseFieldSpec(fieldSpec);
deps.forEach(dep => console.log(`  Field: "${dep.field}", Path: "${dep.path}"`));