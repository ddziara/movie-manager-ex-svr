// see: https://relay.dev/graphql/connections.htm

import { IGetRowsFunReturn } from "../database/db-data-moviemanager";

export interface IConnectionArgs {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
  offset?: number;
}

export interface IPageInfo {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startCursor: string;
  endCursor: string;
}

export interface IEdge<T> {
  node: T;
  cursor: string;
}

export interface IConnection<T, BI = bigint> {
  edges: IEdge<T>[] | null;
  nodes: T[] | null;
  pageInfo: IPageInfo;
  totalRowsCount: BI;
}

export const decodeCursor = (cursorStr: string): Record<string, unknown> => {
  const buf = Buffer.from(cursorStr, "base64");
  const s = buf.toString();
  return JSON.parse(s);
};

export const encodeCursor = (cursor: Record<string, unknown>): string => {
  const s = JSON.stringify(cursor);
  return Buffer.from(s).toString("base64");
};

/**
 * Function builds connection response object for given response.rows
 * 
 * @param response 
 * @param hasPreviousPage 
 * @param hasNextPage 
 * @param cursorFields 
 * @param extraFields - extra fields to add to each row (for example to enforce resolving field type) or function returning extra fields and row as parameter
 * @returns 
 */
export const buildConnectionResponse = <T>(
  response: IGetRowsFunReturn,
  hasPreviousPage: boolean,
  hasNextPage: boolean,
  cursorFields: string[],
  extraFields?: Record<string, unknown> | (() => Record<string, unknown>)
): IConnection<Partial<T>> => {
  const rows = extraFields
    ? response.rows.map((row) => ({
        ...row,
        ...(typeof extraFields === "function" ? extraFields()  : extraFields),
      }))
    : response.rows;

  // translate "rows" to "edges"
  const edges = rows.map((row) => {
    const cursorObj: Record<string, unknown> = {};

    for (let i = 0; i < cursorFields.length; i++)
      cursorObj[cursorFields[i]] = row[cursorFields[i]];

    return {
      node: row,
      cursor: encodeCursor(cursorObj),
    };
  }) as IEdge<Partial<T>>[];

  let hasPreviousPage2 = false;
  let hasNextPage2 = false;
  let startCursor = "";
  let endCursor = "";

  const actualOffset = response.offset !== undefined ? response.offset : 0;

  if (edges.length > 0) {
    if (response.reversedOrder) {
      // ^ row_k
      // ^ row_k_p1
      // ^  ...
      // ^ <----- start
      // ^ ...
      const hasNextPageFromOffset =
        response.offset !== undefined ? response.offset > 0 : false;

      hasPreviousPage2 = response.rows_count ? response.rows_count > edges.length + actualOffset : false;
      hasNextPage2 = hasNextPage || hasNextPageFromOffset;
    } else {
      const hasPreviousPageFromOffset =
        response.offset !== undefined ? response.offset > 0 : false;

      hasPreviousPage2 = hasPreviousPage || hasPreviousPageFromOffset;
      hasNextPage2 = response.rows_count ? response.rows_count > edges.length + actualOffset : false;
    }

    // note: assuming correct order of rows
    startCursor = edges[0].cursor;
    endCursor = edges[edges.length - 1].cursor;
  }

  const connection: IConnection<Partial<T>> = {
    edges,
    nodes: rows as unknown as Partial<T>[],
    pageInfo: {
      hasPreviousPage: hasPreviousPage2,
      hasNextPage: hasNextPage2,
      startCursor,
      endCursor,
    },
    totalRowsCount: response.total_rows_count !== undefined ? response.total_rows_count : BigInt(0)
  };

  return connection;
};
