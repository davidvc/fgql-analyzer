import { analyzeSchema } from './src/analyzer.js';

const schema = `
interface ListingV2 {
  listingId: ID!
}

type SingleSkuListing implements ListingV2 {
  listingId: ID!
  items: [Item!]!
}

type Item {
  id: ID!
  sellerPrice: SellerPrice
}

type SellerPrice {
  fixedPrice: Price
}

type Price {
  original: Money
}

type Money {
  amount: Float
}

type ListingReference {
  listingId: ID!
  listing: ListingV2
}

type RealtimeSellingListingDetails {
  listingReference: ListingReference
  
  adsSecondaryDisplayMessages: [String] @join__field(
    graph: ADSCONTENTHUB, 
    requires: "listingReference { listing { items { sellerPrice { fixedPrice { original { amount } } } } } }"
  )
}

directive @join__field(
  graph: String!
  requires: String
) repeatable on FIELD_DEFINITION
`;

console.log('Analyzing test schema...');
const result = await analyzeSchema(schema, 'test-resolution.graphql');

// Find dependencies
const deps = result.dependencies.filter(
  d => d.dependingField === 'adsSecondaryDisplayMessages'
);

console.log('\nTotal dependencies:', deps.length);
console.log('\nAll dependencies:');
deps.forEach(d => {
  console.log(`  ${d.fieldPath} -> ${d.dependedType}.${d.dependedField}`);
});

// Check for Item dependencies
const itemDeps = deps.filter(d => d.dependedType === 'Item');
console.log('\nItem dependencies:', itemDeps.length);

// Check what the parseFieldSpec extracted
console.log('\nChecking field spec parsing...');
import { parse, visit } from 'graphql';
const ast = parse(schema);

visit(ast, {
  Directive(node) {
    if (node.name.value === 'join__field') {
      const requiresArg = node.arguments?.find(arg => arg.name.value === 'requires');
      if (requiresArg) {
        console.log('\nRequires clause:', requiresArg.value.value);
      }
    }
  }
});