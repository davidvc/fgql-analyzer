import { analyzeSchema } from './src/analyzer.js';
import fs from 'fs-extra';

// Test schema with nested key fields
const testSchema = `
type Order @key(fields: "id") @key(fields: "buyer { id }") {
  id: ID!
  buyer: User!
  items: [OrderItem!]!
}

type User @key(fields: "id") @key(fields: "profile { email }") {
  id: ID!
  profile: UserProfile!
}

type UserProfile {
  email: String!
  name: String
}

type OrderItem @key(fields: "order { id } sku") {
  order: Order!
  sku: String!
  quantity: Int!
}

directive @key(fields: String!) on OBJECT | INTERFACE
`;

console.log('Testing nested key field extraction...\n');

const analysis = await analyzeSchema(testSchema, 'test-nested-keys.graphql');

// Check key fields
console.log('Order key fields:', analysis.types.Order.keyFields);
console.log('User key fields:', analysis.types.User.keyFields);
console.log('OrderItem key fields:', analysis.types.OrderItem.keyFields);

// Now test with the real schema
console.log('\n\nChecking real schema for nested key fields...\n');

const schemaContent = await fs.readFile('sdl.graphqls', 'utf8');
const realAnalysis = await analyzeSchema(schemaContent, 'sdl.graphqls');

// Find types with nested key fields
const typesWithNestedKeys = [];
for (const [typeName, type] of Object.entries(realAnalysis.types)) {
  const nestedKeys = type.keyFields.filter(k => k.includes('.'));
  if (nestedKeys.length > 0) {
    typesWithNestedKeys.push({ typeName, nestedKeys });
  }
}

console.log(`Found ${typesWithNestedKeys.length} types with nested key fields:\n`);
typesWithNestedKeys.slice(0, 10).forEach(({ typeName, nestedKeys }) => {
  console.log(`${typeName}:`);
  nestedKeys.forEach(key => console.log(`  - ${key}`));
});

// Check if key field dependencies are created for nested keys
const keyDeps = realAnalysis.dependencies.filter(d => d.directive === 'key');
const nestedKeyDeps = keyDeps.filter(d => d.fieldPath.includes('.'));

console.log(`\n\nFound ${nestedKeyDeps.length} key dependencies with nested paths`);
if (nestedKeyDeps.length > 0) {
  console.log('\nSample nested key dependencies:');
  nestedKeyDeps.slice(0, 5).forEach(dep => {
    console.log(`  ${dep.dependingType}.${dep.dependingField} -> ${dep.dependedType}.${dep.dependedField}`);
    console.log(`    Path: ${dep.fieldPath}`);
  });
}