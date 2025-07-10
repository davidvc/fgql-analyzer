import { parse, visit } from 'graphql';
import fs from 'fs-extra';

// Read the actual schema
const schemaContent = await fs.readFile('/Users/dvc/projects/fgql-analyzer/sdl.graphqls', 'utf8');

// Parse it
const ast = parse(schemaContent);

// Find the RealtimeSellingListingDetails type and its adsSecondaryDisplayMessages field
let foundField = false;

visit(ast, {
  ObjectTypeDefinition(node) {
    if (node.name.value === 'RealtimeSellingListingDetails' && !foundField) {
      console.log('Found RealtimeSellingListingDetails type');
      
      // Find the adsSecondaryDisplayMessages field
      const field = node.fields?.find(f => f.name.value === 'adsSecondaryDisplayMessages');
      if (field) {
        foundField = true;
        console.log('\nFound adsSecondaryDisplayMessages field');
        console.log('Field type:', field.type);
        
        // Check directives
        const joinFieldDirective = field.directives?.find(d => d.name.value === 'join__field');
        if (joinFieldDirective) {
          console.log('\nFound @join__field directive');
          
          // Get the graph argument
          const graphArg = joinFieldDirective.arguments?.find(a => a.name.value === 'graph');
          console.log('Graph:', graphArg?.value?.value);
          
          // Get the requires argument
          const requiresArg = joinFieldDirective.arguments?.find(a => a.name.value === 'requires');
          if (requiresArg) {
            console.log('\nRequires clause:');
            console.log(requiresArg.value.value);
            
            // This is what gets passed to parseFieldSpec
            console.log('\nThis is the exact string that parseFieldSpec receives');
          }
        }
      }
    }
  }
});