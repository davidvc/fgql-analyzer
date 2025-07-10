import { parse, visit } from "graphql";

const schema = `
interface ListingV2
  @join__type(graph: ADSCONTENTHUB, key: "listingId", resolvable: false)
{
  listingId: ID!
}

type SingleSkuListing implements ListingV2 {
  listingId: ID!
  items: [Item!]!
}

directive @join__type(
  graph: String!
  key: String
  resolvable: Boolean
) repeatable on OBJECT | INTERFACE
`;

const ast = parse(schema);

visit(ast, {
  InterfaceTypeDefinition(node) {
    console.log("Found interface:", node.name.value);
    console.log("Directives:", node.directives?.map(d => d.name.value));
  },
  ObjectTypeDefinition(node) {
    console.log("Found type:", node.name.value);
    console.log("Implements:", node.interfaces?.map(i => i.name.value));
  }
});