import { test } from 'node:test';
import assert from 'node:assert';
import { analyzeSchema } from '../src/analyzer.js';
import fs from 'fs-extra';
import path from 'path';

test('analyzeSchema correctly parses field dependencies', async () => {
  const schema = `
    # Subgraph: test
    type Product @key(fields: "id") {
      id: ID!
      price: Float! @external
      weight: Float @external
      
      shippingCost: Float! @requires(fields: "weight price")
    }
  `;
  
  const analysis = await analyzeSchema(schema, 'test-schema.graphql');
  
  assert.equal(analysis.metadata.totalTypes, 1);
  assert.equal(analysis.metadata.totalDependencies, 2);
  
  const deps = analysis.dependencies;
  assert.equal(deps.length, 2);
  
  // Check weight dependency
  const weightDep = deps.find(d => d.dependedField === 'weight');
  assert.equal(weightDep.dependingType, 'Product');
  assert.equal(weightDep.dependingField, 'shippingCost');
  assert.equal(weightDep.directive, 'requires');
  
  // Check price dependency
  const priceDep = deps.find(d => d.dependedField === 'price');
  assert.equal(priceDep.dependingType, 'Product');
  assert.equal(priceDep.dependingField, 'shippingCost');
  assert.equal(priceDep.directive, 'requires');
});

test('analyzeSchema handles nested field specifications', async () => {
  const schema = `
    # Subgraph: test
    type Product {
      id: ID!
      dimensions: Dimensions @external
      
      volume: Float! @requires(fields: "dimensions { length width height }")
    }
    
    type Dimensions {
      length: Float! @external
      width: Float! @external
      height: Float! @external
    }
  `;
  
  const analysis = await analyzeSchema(schema, 'test-schema.graphql');
  
  assert.equal(analysis.metadata.totalDependencies, 4); // dimensions + length + width + height
  
  const deps = analysis.dependencies;
  
  // Check dimensions dependency
  const dimDep = deps.find(d => d.dependedField === 'dimensions');
  assert.equal(dimDep.dependingField, 'volume');
  assert.equal(dimDep.fieldPath, 'dimensions');
  
  // Check nested field dependencies
  const lengthDep = deps.find(d => d.dependedField === 'length');
  assert.equal(lengthDep.dependingField, 'volume');
  assert.equal(lengthDep.dependedType, 'Dimensions'); // Capitalized type name
  assert.equal(lengthDep.fieldPath, 'dimensions.length');
});

test('analyzeSchema handles @provides directive', async () => {
  const schema = `
    # Subgraph: test
    type Warehouse {
      id: ID!
      inventory: [Product!]! @provides(fields: "name price")
    }
    
    type Product @key(fields: "id") {
      id: ID! @external
      name: String! @external
      price: Float! @external
    }
  `;
  
  const analysis = await analyzeSchema(schema, 'test-schema.graphql');
  
  const deps = analysis.dependencies.filter(d => d.directive === 'provides');
  assert.equal(deps.length, 2);
  
  const nameDep = deps.find(d => d.dependedField === 'name');
  assert.equal(nameDep.dependingType, 'Warehouse');
  assert.equal(nameDep.dependingField, 'inventory');
  
  const priceDep = deps.find(d => d.dependedField === 'price');
  assert.equal(priceDep.dependingType, 'Warehouse');
  assert.equal(priceDep.dependingField, 'inventory');
});

test('analyzeSchema extracts subgraph from comments', async () => {
  const schema = `
    # Subgraph: inventory
    type Product {
      id: ID!
      inStock: Boolean!
    }
  `;
  
  const analysis = await analyzeSchema(schema, 'some-file.graphql');
  
  // Check that dependencies have correct subgraph
  assert.equal(analysis.metadata.schemaFile, 'some-file.graphql');
});

test('analyzeSchema handles type extensions', async () => {
  const schema = `
    # Subgraph: reviews
    extend type Product @key(fields: "id") {
      id: ID! @external
      price: Float! @external
      
      reviews: [Review!]!
      valueRating: Float! @requires(fields: "price")
    }
    
    type Review {
      id: ID!
      rating: Int!
    }
  `;
  
  const analysis = await analyzeSchema(schema, 'reviews.graphql');
  
  assert.equal(analysis.metadata.totalTypes, 2); // Product (extended) + Review
  
  const productType = analysis.types['Product'];
  assert.equal(productType.isExtension, true);
  
  const deps = analysis.dependencies;
  const priceDep = deps.find(d => d.dependedField === 'price');
  assert.equal(priceDep.dependingField, 'valueRating');
});

test('analyzeSchema tracks @key directive dependencies', async () => {
  const schema = `
    # Subgraph: inventory
    extend type Product @key(fields: "id sku") {
      id: ID! @external
      sku: String! @external
      
      inStock: Boolean!
      warehouse: Warehouse
    }
    
    type Warehouse {
      id: ID!
      location: String!
    }
  `;
  
  const analysis = await analyzeSchema(schema, 'inventory.graphql');
  
  // Check that key fields are tracked
  const productType = analysis.types['Product'];
  assert.equal(productType.keyFields.length, 2);
  assert.ok(productType.keyFields.includes('id'));
  assert.ok(productType.keyFields.includes('sku'));
  
  // Check dependencies for key fields
  const keyDeps = analysis.dependencies.filter(d => d.directive === 'key');
  assert.equal(keyDeps.length, 2); // One for each key field
  
  const idKeyDep = keyDeps.find(d => d.dependedField === 'id');
  assert.equal(idKeyDep.dependingField, '_entity');
  assert.equal(idKeyDep.directive, 'key');
  
  const skuKeyDep = keyDeps.find(d => d.dependedField === 'sku');
  assert.equal(skuKeyDep.dependingField, '_entity');
  assert.equal(skuKeyDep.directive, 'key');
  
  // Check external field dependencies
  const externalDeps = analysis.dependencies.filter(d => d.directive === 'external');
  assert.equal(externalDeps.length, 2); // id and sku are both external
});

test('analyzeSchema tracks key field references in @requires', async () => {
  const schema = `
    # Subgraph: pricing
    type Product @key(fields: "id") {
      id: ID!
      name: String!
      basePrice: Float!
    }
    
    extend type Order {
      items: [OrderItem!]!
      totalPrice: Float! @requires(fields: "items { product { id basePrice } quantity }")
    }
    
    type OrderItem {
      product: Product! @external
      quantity: Int!
    }
  `;
  
  const analysis = await analyzeSchema(schema, 'pricing.graphql');
  
  // Find the dependency on Product.id (which is a key field)
  const idDep = analysis.dependencies.find(d => 
    d.dependedField === 'id' && 
    d.dependedType === 'Product' && // Capitalized type name
    d.dependingField === 'totalPrice'
  );
  
  assert.ok(idDep);
  assert.equal(idDep.directive, 'key');
  assert.equal(idDep.fieldPath, 'items.product.id');
});

test('analyzeSchema handles field names that do not match type names', async () => {
  const schema = `
    # Subgraph: marketplace
    type Query {
      searchListings: [ListingReference!]!
    }
    
    type ListingReference @key(fields: "id sku") {
      id: ID!
      sku: String!
      title: String!
      price: Float!
    }
    
    type Cart {
      items: [CartItem!]!
      totalValue: Float! @requires(fields: "items { listing { id price } quantity }")
    }
    
    type CartItem {
      listing: ListingReference! @external
      quantity: Int!
    }
  `;
  
  const analysis = await analyzeSchema(schema, 'marketplace.graphql');
  
  // Check that field types are correctly captured
  const cartItemType = analysis.types['CartItem'];
  assert.equal(cartItemType.fields.listing.type, 'ListingReference');
  
  // Find dependencies on ListingReference fields
  const listingIdDep = analysis.dependencies.find(d => 
    d.dependedField === 'id' && 
    d.dependedType === 'ListingReference' &&
    d.fieldPath === 'items.listing.id'
  );
  
  assert.ok(listingIdDep);
  assert.equal(listingIdDep.directive, 'key');
  assert.equal(listingIdDep.dependingField, 'totalValue');
  
  const listingPriceDep = analysis.dependencies.find(d => 
    d.dependedField === 'price' && 
    d.dependedType === 'ListingReference' &&
    d.fieldPath === 'items.listing.price'
  );
  
  assert.ok(listingPriceDep);
  assert.equal(listingPriceDep.directive, 'requires'); // price is not a key field
});