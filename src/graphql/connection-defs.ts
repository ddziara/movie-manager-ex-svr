// see: https://relay.dev/graphql/connections.htm

export default `
type PageInfo {
  hasPreviousPage: Boolean!
  hasNextPage: Boolean!
  startCursor: String!
  endCursor: String!
}
`;

export const getEdgeType = (edgeTypePrefix: string) => `${edgeTypePrefix}Edge`;

export const buildConnectionEdgeTypes = (connectionTypePrefix: string, edgeTypePrefix: string, nodeType: string) => `
type ${edgeTypePrefix}Edge {
    node: ${nodeType}!
    cursor: String!
    # here can come additional fields
}

type ${connectionTypePrefix}Connection {
    edges: [${getEdgeType(edgeTypePrefix)}]
    nodes: [${nodeType}]
    pageInfo: PageInfo!
}
`;


