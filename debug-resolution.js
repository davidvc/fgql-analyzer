import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

// Get the cache for the schema we just analyzed
const filePath = '/Users/dvc/projects/fgql-analyzer/sdl.graphqls';
const hash = crypto.createHash('md5').update(filePath).digest('hex');
const cacheFile = path.join(process.env.HOME, '.fgql-analyzer', 'cache', hash + '.json');

const data = JSON.parse(await fs.readFile(cacheFile, 'utf8'));

// Find the adsSecondaryDisplayMessages field dependencies
const deps = data.dependencies.filter(d => 
  d.dependingType === 'RealtimeSellingListingDetails' && 
  d.dependingField === 'adsSecondaryDisplayMessages'
);

console.log('Total dependencies from adsSecondaryDisplayMessages:', deps.length);

// Group by depended type
const typeGroups = {};
deps.forEach(d => {
  typeGroups[d.dependedType] = (typeGroups[d.dependedType] || 0) + 1;
});
console.log('\nDependencies by type:', typeGroups);

// Check for Item dependencies
const itemDeps = deps.filter(d => d.dependedType === 'Item');
console.log('\nItem dependencies found:', itemDeps.length);

if (itemDeps.length > 0) {
  console.log('\nItem dependencies:');
  itemDeps.forEach(d => {
    console.log(`  ${d.fieldPath} -> ${d.dependedType}.${d.dependedField}`);
  });
} else {
  // Show paths that should resolve to Item
  console.log('\nPaths containing "items":');
  deps.filter(d => d.fieldPath.includes('items')).forEach(d => {
    console.log(`  ${d.fieldPath} -> ${d.dependedType}.${d.dependedField}`);
  });
}