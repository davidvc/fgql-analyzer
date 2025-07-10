import { analyzeSchema } from './src/analyzer.js';
import fs from 'fs-extra';

const schemaContent = await fs.readFile('sdl.graphqls', 'utf8');
const analysis = await analyzeSchema(schemaContent, 'sdl.graphqls');

// Find some key field dependencies and verify they're correct
const keyDeps = analysis.dependencies.filter(d => d.directive === 'key');

console.log('Key field dependency verification:');
console.log('=================================\n');

// Take a few samples and verify
const samples = keyDeps.slice(0, 5);
for (const dep of samples) {
  console.log(`Dependency: ${dep.dependingType}.${dep.dependingField} -> ${dep.dependedType}.${dep.dependedField}`);
  console.log(`Field path: ${dep.fieldPath}`);
  
  // Check if the depended field is actually a key field
  const dependedType = analysis.types[dep.dependedType];
  if (dependedType) {
    const isKeyField = dependedType.keyFields.includes(dep.dependedField);
    console.log(`Is ${dep.dependedField} a key field of ${dep.dependedType}? ${isKeyField}`);
    if (!isKeyField) {
      console.log(`  Key fields of ${dep.dependedType}: ${dependedType.keyFields.join(', ')}`);
    }
  }
  console.log('---\n');
}

// Check if there are any false negatives - types with key fields that should have dependencies
console.log('\nTypes with key fields but no key dependencies:');
for (const [typeName, type] of Object.entries(analysis.types)) {
  if (type.keyFields && type.keyFields.length > 0) {
    const hasKeyDeps = keyDeps.some(d => d.dependedType === typeName && type.keyFields.includes(d.dependedField));
    if (!hasKeyDeps) {
      // Check if any field has @external directive on the key fields
      let hasExternal = false;
      for (const keyField of type.keyFields) {
        const field = type.fields[keyField];
        if (field && field.directives.some(d => d.name.value === 'external')) {
          hasExternal = true;
          break;
        }
      }
      if (!hasExternal && type.keyFields.length > 0) {
        console.log(`  ${typeName}: key fields = [${[...new Set(type.keyFields)].join(', ')}]`);
      }
    }
  }
}