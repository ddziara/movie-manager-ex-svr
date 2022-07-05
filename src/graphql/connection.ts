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

export interface IConnection<T> {
  edges: IEdge<T>[] | null;
  pageInfo: IPageInfo;
  totalCount: number;
}

export interface IConnectionResolver<T> {
  edges: IEdge<T>[] | null;
  pageInfo: IPageInfo;
  totalCount: number;
}

const _decodeCursor = (cursorStr: string) => {
  const buf = Buffer.from(cursorStr, "base64");
  return buf.readInt32BE(0);
};

const _encodeCursor = (cursor: number) => {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(cursor, 0);
  return buf.toString("base64");
};

interface ILimitOffset {
  limit?: number;
  offset?: number;
}

export const translateConnectionArgs = (
  first: number | undefined,
  after: string | undefined,
  last: number | undefined,
  before: string | undefined,
  offset: number | undefined
): ILimitOffset => {
  let afterOffset;
  let beforeOffset;
  let limit;

  if (first !== undefined) {
    if (first < 0) throw new Error("");
  }

  if (last !== undefined) {
    if (last < 0) throw new Error("");
  }

  if (after !== undefined) {
    afterOffset = _decodeCursor(after);
  }

  if (before !== undefined) {
    beforeOffset = _decodeCursor(before);
  }

  if (afterOffset !== undefined && beforeOffset !== undefined) {
    //
    //    afterOffset
    // <- afterOffset+1
    //
    // <- beforeOffset-1
    //    beforeOffset
    if (afterOffset + 2 <= beforeOffset) {
      // when afterOffset + 2 === beforeOffset
      //
      //     afterOffset
      // <--
      //     beforeOffset
      //
      // then
      //  limit = beforeOffset - afterOffset - 1 = afterOffset + 2 - afterOffset - 1 = 1
      limit = beforeOffset - afterOffset - 1; 
    }

    offset = afterOffset + 1;
  } else if (afterOffset !== undefined) {
    offset = afterOffset + 1;
  } else if (beforeOffset !== undefined) {
    if (last !== undefined) {
      limit = last;
      offset = beforeOffset - last;

      if (offset < 0) {
        limit += offset;
        offset = undefined; // 0
      }
    } else {
      //
      // <--
      //     beforeOffset
      //
      limit = beforeOffset;
      offset = undefined; // 0
    }
  }

  if (first !== undefined) {
    if (limit !== undefined) {
      limit = Math.min(first, limit);
    } else {
      limit = first;
    }
  }

  if (last !== undefined) {
    if (limit !== undefined) {
      const diff = last - limit;

      if (diff < 0) {
        if (offset !== undefined) {
          offset -= diff;
        } else {
          offset = -diff;
        }
        limit = last;
      }
    }
    // else {
    //   note that it's impossible now to determime the offset
    //   it is only known tha  offset >= prev_offset
  }

  return {
    limit,
    offset,
  };
};

export const buildConnectionResponse = <T>(
  response: IGetRowsFunReturn,
  startOffset: number
): IConnectionResolver<Partial<T>> => {
  let offset = startOffset;

  // translate "response.rows" to "edges"
  const edges = response.rows.map((row) => ({
    node: row,
    cursor: _encodeCursor(offset++),
  })) as IEdge<Partial<T>>[];

  const connection: IConnectionResolver<Partial<T>> = {
    edges,
    pageInfo: {
      hasPreviousPage: edges.length > 0 ? startOffset > 0 : false,
      hasNextPage: edges.length > 0 ? startOffset + edges.length < response.total_count : false,
      startCursor: edges.length > 0 ? edges[0].cursor : "",
      endCursor: edges.length > 0 ? edges[edges.length-1].cursor : "",
    },
    totalCount: response.total_count,
  };

  return connection;
};
