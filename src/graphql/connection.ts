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
}

export interface IConnectionResolver<T> {
  edges: IEdge<T>[] | null;
  pageInfo: IPageInfo;
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

// interface ILimitOffset {
//   limit?: number;
//   offset?: number;
// }

// export const translateConnectionArgs = (
//   first: number | undefined,
//   after: string | undefined,
//   last: number | undefined,
//   before: string | undefined,
//   offset: number | undefined
// ): ILimitOffset => {
//   let afterOffset;
//   let beforeOffset;
//   let limit;

//   if (first !== undefined) {
//     if (first < 0) throw new Error("");
//   }

//   if (last !== undefined) {
//     if (last < 0) throw new Error("");
//   }

//   if (after !== undefined) {
//     afterOffset = _decodeCursor(after);
//   }

//   if (before !== undefined) {
//     beforeOffset = _decodeCursor(before);
//   }

//   if (afterOffset !== undefined && beforeOffset !== undefined) {
//     //
//     //    afterOffset
//     // <- afterOffset+1
//     //
//     // <- beforeOffset-1
//     //    beforeOffset
//     if (afterOffset + 2 <= beforeOffset) {
//       // when afterOffset + 2 === beforeOffset
//       //
//       //     afterOffset
//       // <--
//       //     beforeOffset
//       //
//       // then
//       //  limit = beforeOffset - afterOffset - 1 = afterOffset + 2 - afterOffset - 1 = 1
//       limit = beforeOffset - afterOffset - 1;
//     }

//     offset = afterOffset + 1;
//   } else if (afterOffset !== undefined) {
//     offset = afterOffset + 1;
//   } else if (beforeOffset !== undefined) {
//     if (last !== undefined) {
//       limit = last;
//       offset = beforeOffset - last;

//       if (offset < 0) {
//         limit += offset;
//         offset = undefined; // 0
//       }
//     } else {
//       //
//       // <--
//       //     beforeOffset
//       //
//       limit = beforeOffset;
//       offset = undefined; // 0
//     }
//   }

//   if (first !== undefined) {
//     if (limit !== undefined) {
//       limit = Math.min(first, limit);
//     } else {
//       limit = first;
//     }
//   }

//   if (last !== undefined) {
//     if (limit !== undefined) {
//       const diff = last - limit;

//       if (diff < 0) {
//         if (offset !== undefined) {
//           offset -= diff;
//         } else {
//           offset = -diff;
//         }
//         limit = last;
//       }
//     }
//     // else {
//     //   note that it's impossible now to determime the offset
//     //   it is only known tha  offset >= prev_offset
//   }

//   return {
//     limit,
//     offset,
//   };
// };

export const buildConnectionResponse = <T>(
  response: IGetRowsFunReturn,
  hasPreviousPage: boolean,
  hasNextPage: boolean,
  cursorFields: string[]
): IConnectionResolver<Partial<T>> => {
  // translate "response.rows" to "edges"
  const edges = response.rows.map((row) => {
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
      response.offset !== undefined
        ? response.offset > 0
        : false;

      hasPreviousPage2 = response.total_count > edges.length + actualOffset;
      hasNextPage2 = hasNextPage || hasNextPageFromOffset;
    } else {
      const hasPreviousPageFromOffset =
      response.offset !== undefined
        ? response.offset > 0
        : false;
  
      hasPreviousPage2 = hasPreviousPage || hasPreviousPageFromOffset;
      hasNextPage2 = response.total_count > edges.length + actualOffset;
    }

    // note: assuming correct order of rows
    startCursor = edges[0].cursor; 
    endCursor = edges[edges.length - 1].cursor; 
  }

  const connection: IConnectionResolver<Partial<T>> = {
    edges,
    pageInfo: {
      hasPreviousPage: hasPreviousPage2,
      hasNextPage: hasNextPage2,
      startCursor,
      endCursor,
    },
  };

  return connection;
};
