import { analyzeSchema } from './src/analyzer.js';
import fs from 'fs-extra';

// Add debugging to the analyzer
const originalResolve = analyzeSchema.toString();

// Read the actual schema and find the adsSecondaryDisplayMessages field
const schemaContent = await fs.readFile('/Users/dvc/projects/fgql-analyzer/sdl.graphqls', 'utf8');

// Find the line with adsSecondaryDisplayMessages
const lines = schemaContent.split('\n');
const lineIndex = lines.findIndex(line => line.includes('adsSecondaryDisplayMessages:'));
console.log('Found adsSecondaryDisplayMessages at line:', lineIndex + 1);
console.log('Field definition:', lines[lineIndex]?.trim());

// Extract just the requires clause
const requiresMatch = lines[lineIndex]?.match(/requires:\s*"([^"]+)"/);
if (requiresMatch) {
  console.log('\nRequires clause:');
  console.log(requiresMatch[1]);
  
  // Parse the field spec manually
  console.log('\nParsing field spec...');
  const fieldSpec = requiresMatch[1];
  
  // Simple parsing to show the path
  const paths = [];
  let currentPath = [];
  let depth = 0;
  let currentField = '';
  
  for (const char of fieldSpec) {
    if (char === '{') {
      if (currentField.trim()) {
        currentPath.push(currentField.trim());
        paths.push([...currentPath].join('.'));
        currentField = '';
      }
      depth++;
    } else if (char === '}') {
      if (currentField.trim()) {
        currentPath.push(currentField.trim());
        paths.push([...currentPath].join('.'));
        currentField = '';
      }
      currentPath.pop();
      depth--;
    } else if (char === ' ' && depth > 0 && currentField.trim()) {
      currentPath.push(currentField.trim());
      paths.push([...currentPath].join('.'));
      currentField = '';
      currentPath.pop();
    } else if (char !== ' ') {
      currentField += char;
    }
  }
  
  console.log('\nExtracted paths:');
  paths.forEach(p => console.log('  ' + p));
}

// Check what type RealtimeSellingListingDetails is
console.log('\n\nChecking RealtimeSellingListingDetails type...');
const typeMatch = schemaContent.match(/type\s+RealtimeSellingListingDetails[^{]*{/);
if (typeMatch) {
  console.log('Found type definition');
  
  // Find listingReference field
  const startIndex = typeMatch.index + typeMatch[0].length;
  const snippet = schemaContent.substring(startIndex, startIndex + 2000);
  const listingRefMatch = snippet.match(/listingReference:\s*(\w+)/);
  if (listingRefMatch) {
    console.log('listingReference field type:', listingRefMatch[1]);
  }
}