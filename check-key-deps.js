import { analyzeSchema } from './src/analyzer.js';
import fs from 'fs-extra';

const schemaContent = await fs.readFile('sdl.graphqls', 'utf8');
const analysis = await analyzeSchema(schemaContent, 'sdl.graphqls');

// Find key field dependencies
const keyDeps = analysis.dependencies.filter(d => d.directive === 'key');
console.log('Total key field dependencies:', keyDeps.length);

// Group by depending type
const byType = {};
keyDeps.forEach(d => {
  if (!byType[d.dependingType]) byType[d.dependingType] = 0;
  byType[d.dependingType]++;
});

console.log('\nTypes with key field dependencies:');
Object.entries(byType).slice(0, 10).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});

// Show a sample dependency
if (keyDeps.length > 0) {
  console.log('\nSample key dependency:');
  console.log(JSON.stringify(keyDeps[0], null, 2));
}

// Check why BusinessPolicy doesn't have key dependencies
console.log('\nChecking BusinessPolicy:');
const bpType = analysis.types.BusinessPolicy;
console.log('- Is extension?', bpType.isExtension);
console.log('- Key fields:', bpType.keyFields);
console.log('- Number of fields:', Object.keys(bpType.fields).length);

// Check if id field exists and is external
if (bpType.fields.id) {
  const idField = bpType.fields.id;
  console.log('- Has id field');
  console.log('- id field directives:', idField.directives.map(d => d.name.value));
}