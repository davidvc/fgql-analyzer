import { analyzeSchema } from './src/analyzer.js';
import fs from 'fs-extra';

const schemaContent = await fs.readFile('/Users/dvc/projects/fgql-analyzer/sdl.graphqls', 'utf8');

// Count interfaces in the schema
const interfaceMatches = schemaContent.match(/^interface\s+\w+/gm);
console.log('Interfaces found by regex:', interfaceMatches?.length || 0);
if (interfaceMatches) {
  console.log('First 10 interfaces:', interfaceMatches.slice(0, 10));
}

// Now analyze and check what was parsed
const analysis = await analyzeSchema(schemaContent, 'debug-sdl.graphql');

console.log('\nTotal types:', analysis.metadata.totalTypes);
console.log('Interfaces map size:', Object.keys(analysis.interfaces || {}).length);
console.log('Implementations map size:', Object.keys(analysis.implementations || {}).length);

// Check ListingV2 specifically
console.log('\nListingV2 in types:', !!analysis.types.ListingV2);
console.log('ListingV2.isInterface:', analysis.types.ListingV2?.isInterface);
console.log('ListingV2 in interfaces:', !!analysis.interfaces?.ListingV2);

// Check implementations
console.log('\nListingV2 implementations:', analysis.implementations?.ListingV2?.slice(0, 5));