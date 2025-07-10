Given a Federated Graph schema file (SDL) I want to be able to run a CLI that
lets me ask questions about the schema.

For the first iteration, I want to get the list of fields that depend on any fields
in the provided type. A given field depends on another field if the field is part of
the field spec in a requires or provides directive.

The output should include the depending type, the depending
field, the depending subgraph, the type that is being depended on and the field within
the type that is being depended on.

Make sure to consider all fields in the field spec path. For example, if the field myField
has a @requires directive where the field spec is "foo { bar { baz } }}" then foo, bar and
baz are all fields that myField depends on.

Please make sure you understand the format of a fgql schema, and you understand the semantics
of the @requires and @provides directives.

