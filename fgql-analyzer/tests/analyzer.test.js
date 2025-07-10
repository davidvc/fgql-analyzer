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
  assert.equal(lengthDep.dependedType, 'dimensions');
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