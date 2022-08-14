import { DBData } from "./db-data";
import { dateToUTCString } from "./utils";
import { DBcldb } from "./db-db-cldb";
import { DBextra } from "./db-db-extra";
import { DBmedia_scanner_cache } from "./db-db-media-scanner-cache";
import { DBmoviemedia } from "./db-db-moviemedia";
import { DBplaylist } from "./db-db-playlist";
//import { DBTable } from './db-table';

import {
  MissingGroupTypeError,
  CannotDeleteUsedTypeError,
  MissingGroupError,
  MissingLastIdError,
  //  MissingMovieError,
} from "../common/errors";

import { LastIdReturnType } from "./db-types";
// import { ISendMovieIconFun } from '../hateoas/i-send-movie-icon-fun';
//import { dirname } from "path";
// import { IStoreMovieIconFun } from '../hateoas/i-store-movie-icon-fun';
//import express from "express";
// import { IRemoveMovieIconFun } from '../hateoas/i-remove-movie-icon-fun';

import { USE_FOLDER_COLUMN_IN_MOVIES } from "./db-const";

//==============================
// General functions
interface ITransformStringFun {
  (s: string, indx: number, extra: unknown[]): string;
}

// get rows
export interface RowObject {
  count?: number;
  [index: string]: unknown;
}

export interface IGetRowsFunReturn {
  id_col_names: string[];
  foreign_id_name?: string;
  rows: RowObject[];
  total_count: number;
  reversedOrder: boolean;
  offset: number | undefined;
}

//==============================
// Type functions
export interface IGetMovieGroupTypesFun {
  (
    tid: number | undefined,
    limit?: number,
    offset?: number
  ): Promise<IGetRowsFunReturn>;
}

export interface IAddMovieGroupTypeFun {
  (column_names: string[], column_values: unknown[]): Promise<number>;
}

export interface IUpdateMovieGroupTypeFun {
  (
    tid: number,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void>;
}

export interface IDeleteMovieGroupTypeFun {
  (tid: number): Promise<void>;
}

//==============================
// Group functions
export interface IGetMovieGroupsFun {
  (
    tid: number | undefined,
    gid: number | undefined,
    limit?: number,
    offset?: number
  ): Promise<IGetRowsFunReturn>;
}

// add group row
export interface IAddMovieGroupFun {
  (
    tid: number | undefined,
    mid: string | undefined,
    column_names: string[],
    column_values: unknown[]
  ): Promise<number>;
}

// update group row
export interface IUpdateMovieGroupFun {
  (
    gid: number,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void>;
}

// delete group row
export interface IDeleteMovieGroupFun {
  (gid: number): Promise<void>;
}

// move group to type
export interface IMoveMovieGroup2TypeFun {
  (gid: number, new_tid: number): Promise<void>;
}

export interface IMoveMovieGroup2NoType {
  (tid: number, gid: number): Promise<void>;
}

//==============================
// Movie functions
export interface IGetMoviesFun {
  (
    gid: number | undefined,
    mid: string | undefined,
    limit?: number,
    offset?: number
  ): Promise<IGetRowsFunReturn>;
}

export interface IAddMovieFun {
  (
    gid: number | undefined,
    new_listOrder: number | undefined,
    column_names: string[],
    column_values: unknown[] /*, mediaFullPath: string*/
  ): Promise<string>;
}

export interface IUpdateMovieFun {
  (
    mid: string,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void>;
}

export interface IDeleteMovieFun {
  (mid: string): Promise<void>;
}

export interface IMarkMovieGroupMemberFun {
  (mid: string, new_gid: number, new_listOrder?: number): Promise<void>;
}

export interface IUnmarkMovieGroupMemberFun {
  (gid: number, mid: string): Promise<void>;
}

export interface IGetGroupsOfMovieFun {
  (mid: string, limit?: number, offset?: number): Promise<IGetRowsFunReturn>;
}

interface ISearchParams {
  indexFields: string[];
  whereConds: string[];
  whereParams: unknown[];
  orderByCols: string[];
  reversedOrder: boolean;
  limit: number | undefined;
  offset: number | undefined;
}

interface ISearchWhere {
  whereCond: string;
  params: unknown[];
}

interface IAdjustRowsResult {
  rows: RowObject[];
  offset: number | undefined;
}

// media prefixes
const MEDIA_INFO_PREFIX = "MOVIE_";
const PLAY_ITEM_INFO_PREFIX = "Computer_";

// constants
enum InsertType {
  Insert = 0,
  InsertOrReplace = 1,
  InsertOrRollback = 2,
  InsertOrAbort = 3,
  InsertOrFail = 4,
  InsertOrIgnore = 5,
}

/**
 * Method builds SQL SELECT statement from table names, 'id' column name & value.
 * It returns SQL string and array of values.
 *
 * @param table_names
 * @param id_names
 * @param id_values - array of 'id' column values
 */

// High level database interface
export abstract class DBDataMovieManager extends DBData {
  dbcldb: DBcldb;
  dbextra: DBextra;
  dbmediaScannerCache: DBmedia_scanner_cache;
  dbmoviemedia: DBmoviemedia;
  dbplaylist: DBplaylist;

  constructor(
    dbcldb: DBcldb,
    dbextra: DBextra,
    dbmediaScannerCache: DBmedia_scanner_cache,
    dbmoviemedia: DBmoviemedia,
    dbplaylist: DBplaylist
  ) {
    super();
    this.dbcldb = dbcldb;
    this.dbextra = dbextra;
    this.dbmediaScannerCache = dbmediaScannerCache;
    this.dbmoviemedia = dbmoviemedia;
    this.dbplaylist = dbplaylist;
  }

  abstract init(): Promise<DBDataMovieManager>;
  abstract uninit(): Promise<void>;

  protected abstract execQuery(
    sql: string,
    ...params: unknown[]
  ): Promise<Record<string, unknown>[]>;
  protected abstract execRetID(
    id: string,
    sql: string,
    ...params: unknown[]
  ): Promise<number>;
  protected abstract execRetVoid(
    sql: string,
    ...params: unknown[]
  ): Promise<void>;
  protected abstract getSQLParameter(index: number): string;

  /**
   * Method builds sep separated list from array of names. When paramater 's' is not undefined than additional sep
   * is added at the end of 's' before new elements.
   *
   * Example: names[0] + sep + names[1] + sep + names[2];
   *
   * @param names - array of names
   * @param sep - separator
   * @param s - initial string; when isn't udefined then ',' is added first.
   * @param transform - function that transforms value; if it returns '' then both separator and value are ignored
   * @param extra - array passed to transform()
   */
  private names2StringList(
    names: string[],
    sep: string | string[],
    s = "",
    transform?: ITransformStringFun,
    extra?: unknown[],
    startIndex = 0
  ): string | undefined {
    let indx = startIndex;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    names.forEach((value: string, index: number, array: string[]): void => {
      if (transform) value = transform(value, indx, extra ? extra : []);

      if (value !== "") {
        if (s !== "") {
          if (sep instanceof Array) s += sep[indx - 1];
          else s += sep;
        }

        s += value;
      }

      indx++;
    });

    return s;
  }

  /**
   * Function transforms list of possibly qualified column names (schema, table) into list of unqualified names.
   *
   * @param cond_col_names - array of column names in form [[schema.]table.]column
   */
  private getListOfIdColNames(cond_col_names: string[]): string[] {
    return cond_col_names.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (value: string, index: number, array: string[]): string => {
        const pos = value.lastIndexOf(".");
        return pos >= 0 ? value.substring(pos + 1) : value;
      }
    );
  }

  private complementColumnsValues(
    column_names: string[],
    column_values: unknown[],
    compl_column_names: string[],
    compl_column_values: unknown[]
  ): void {
    const m = new Map();

    for (let i = 0; i < column_names.length; i++) {
      if (!m.has(column_names[i])) m.set(column_names[i], column_values[i]);
    }

    for (let i = 0; i < compl_column_names.length; i++) {
      if (!m.has(compl_column_names[i]))
        m.set(compl_column_names[i], compl_column_values[i]);
    }

    column_names.length = 0;
    column_values.length = 0;

    for (const [key, value] of m.entries()) {
      column_names.push(key);
      column_values.push(value);
    }
  }

  private _appendExColumnNames(
    column_names: string[],
    tabName: string | ((colName: string) => string) | undefined,
    ex_column_names: string[] | undefined
  ): void {
    if (!ex_column_names) return;

    const uniqueColNames = new Set<string>();

    column_names.forEach((val) => {
      if (!uniqueColNames.has(val)) uniqueColNames.add(val);
    });
    ex_column_names.forEach((val) => {
      if (typeof tabName === "function") {
        tabName = tabName(val);
      }

      const col = tabName ? `${tabName}.${val}` : val;
      if (!uniqueColNames.has(col)) column_names.push(col);
    });
  }

  //================================================================================================================

  /**
   * Method builds SQL SELECT statement from table names, column names to select (+cond. column names) & column names/values and extra conditions for condition.
   * It returns SQL string.
   *
   * Example 1:
   * table_names = [tab1, tab2, tab3]
   * join_conds = ['tab1.col1 = tab2.col2', 'tab2.col1 = tab3.col2']
   * gives: tab1 JOIN tab2 ON tab1.col1 = tab2.col2 LEFT JOIN ON tab2.col1 = tab3.col2
   *
   * @param table_names - array of table names
   * @param column_names - array of column names to select
   * @param cond_col_names - array of column names to form condition
   * @param cond_col_values - array of condition column values
   * @param join_conds - array of conditions for joining tables: <table1> LEFT JOIN <table2> ON <join_cond1_2> ...
   * @param extra_conds
   * @param order_col_names - array of columns for ORDER BY clause
   * @param join_separators
   * @param limit - numbers of rows to retrieve for paging; paging is used if both 'limit' and 'offset' are defined
   * @param offset - offset of rows to tetrieve for paging; paging is used if both 'limit' and 'offset' are defined
   * @param count_name - name of the counter window for paging; it can be empty
   * @param withClause - full WITH clause (example: WITH temptab AS (SELECT ...) )
   * @returns
   */
  private getGetRowsCoreSql(
    table_names: string[],
    column_names: string[],
    cond_col_names: string[],
    cond_col_values: (unknown | (unknown | null)[] | null)[],
    join_conds: string[],
    extra_conds: string[],
    order_col_names: string[],
    join_separators?: string | string[],
    limit?: number,
    offset?: number,
    count_name = "count",
    withClause = ""
  ): string {
    const left_join_transform = (
      s: string,
      indx: number,
      extra: unknown[]
    ): string => {
      return indx > 0 ? `${s} ON ${extra[indx - 1]}` : s;
    };

    let table_list: string | undefined = "";

    if (typeof join_separators !== "undefined") {
      table_list = this.names2StringList(
        table_names,
        join_separators,
        undefined,
        left_join_transform,
        join_conds
      );
    } else {
      table_list = this.names2StringList(table_names, ", ");
    }

    const columns_list = this.names2StringList(column_names, ", ");
    let paramIndex = 0;

    let cond = this.names2StringList(
      cond_col_names,
      " AND ",
      undefined,
      (s: string, indx: number, extra: unknown[]): string => {
        let ret: string;

        if (extra[indx]) {
          if (typeof extra[indx] === "object" && extra[indx] instanceof Array) {
            const arr = extra[indx] as undefined[];

            if (arr.length > 0) {
              // filter off falsy
              const arr2 = arr.filter((val) => !!val);

              if (arr2.length > 0) {
                let p = this.getSQLParameter(paramIndex++);
                const count = arr2.length;

                for (let i = 1; i < count; i++) {
                  p += `, ${this.getSQLParameter(paramIndex++)}`;
                }

                ret = `${s} IN (${p})`;

                if (arr2.length < arr.length) {
                  ret += ` OR ${s} IS NULL`;
                }
              } else {
                ret = `${s} IS NULL`;
              }
            } else {
              ret = "";
            }
          } else {
            ret = `${s} = ${this.getSQLParameter(paramIndex++)}`;
          }
        } else {
          ret = `${s} IS NULL`;
        }

        return ret;
      },
      cond_col_values
    );
    if (typeof join_separators === "undefined")
      cond = this.names2StringList(join_conds, " AND ", cond);
    cond = this.names2StringList(extra_conds, " AND ", cond);
    if (cond !== "") cond = ` WHERE ${cond}`;

    let order = this.names2StringList(order_col_names, ", ");
    if (order !== "") order = ` ORDER BY ${order}`;

    // const paging =
    //   typeof limit !== "undefined" && typeof offset !== "undefined";
    const count_rows =
      count_name !== "" ? `, COUNT(*) OVER() ${count_name}` : ``;

    let sql = `SELECT ${columns_list}${count_rows} FROM ${table_list}${cond}${order}`;

    // syntas: [LIMIT a [OFFSET b]]
    if (limit !== undefined && offset !== undefined) {
      sql += ` LIMIT ${limit} OFFSET ${offset}`;
    } else if (limit !== undefined) {
      sql += ` LIMIT ${limit}`;
    } else if (offset !== undefined) {
      sql += ` LIMIT ${Number.MAX_SAFE_INTEGER} OFFSET ${offset}`;
    }

    if (withClause !== "") sql = `${withClause} ${sql}`; // prepend WITH clause

    return sql;
  }

  /**
   * Method runs SQL SELECT clause.
   * It returns array containing retrieved 1 row.
   *
   * @param table_names - array of table names
   * @param column_names - array of column names to select
   * @param cond_col_names - array of column names to form condition
   * @param cond_col_values - array of condition column values
   * @param join_conds - array of conditions for joining tables: <table1> LEFT JOIN <table2> ON <join_cond1_2> ...
   * @param extra_conds
   * @param extra_cond_values
   * @param order_col_names - array of columns for ORDER BY clause
   * @param join_separators
   * @param limit - numbers of rows to retrieve for paging
   * @param offset - offset of rows to tetrieve for paging
   * @param count_name - name of the counter window for paging
   * @param withClause
   * @returns
   */
  private async getRowsCore(
    table_names: string[],
    column_names: string[],
    cond_col_names: string[],
    cond_col_values: (unknown | (unknown | null)[] | null)[],
    join_conds: string[],
    extra_conds: string[],
    extra_cond_values: unknown[] | undefined,
    order_col_names: string[],
    join_separators?: string | string[],
    limit?: number,
    offset?: number,
    count_name = "count",
    withClause = ""
  ): Promise<RowObject[]> {
    const sql = this.getGetRowsCoreSql(
      table_names,
      column_names,
      cond_col_names,
      cond_col_values,
      join_conds,
      extra_conds,
      order_col_names,
      join_separators,
      limit,
      offset,
      count_name,
      withClause
    );

    //console.log(`cond_col_values=${cond_col_values}`);

    // removes null values from the array because corresponding columns will be replaced by '<col> IS NULL' in WHERE clause
    const cond_col_values_wo_nulls = cond_col_values.filter(
      (value: unknown): boolean => {
        return value != null;
      }
    );

    // handle null in nested arrays
    const cond_col_values_wo_nulls2 = cond_col_values_wo_nulls.map(
      (value: unknown) => {
        if (typeof value === "object" && value instanceof Array) {
          return (value as []).filter((item) => item !== null);
        }
        else {
          return value;
        }
      }
    );

    // flatten array of values
    const cond_col_values_wo_nulls_flatten = cond_col_values_wo_nulls2.reduce(
      (acc: unknown[], val: unknown) => acc.concat(val),
      []
    );

    // console.log(
    //   `cond_col_names = ${cond_col_names}, cond_col_values = ${cond_col_values}, cond_col_values_wo_nulls = ${cond_col_values_wo_nulls}`
    // );
    return (await /*database.all(sql, cond_col_values_wo_nulls)*/ this.execQuery(
      sql,
      ...[
        ...cond_col_values_wo_nulls_flatten,
        ...(extra_cond_values ? extra_cond_values : []),
      ]
    )) as RowObject[];
  }

  //================================================================================================================

  /**
   * Method builds SQL INSERT INTI statement from table name and column names.
   * It returns SQL string.
   *
   * @param table - name of the table
   * @param column_names - array of column names
   */
  private getAddRowCoreSql(
    table: string,
    column_names: string[],
    insert_type: InsertType = InsertType.Insert
  ): string {
    const columns = this.names2StringList(column_names, ", ");
    const valueplacehold = this.names2StringList(
      column_names,
      ", ",
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (s: string, indx: number, extra: unknown[]): string => {
        return this.getSQLParameter(indx);
      }
    );

    let insert_text = "INSERT";

    switch (insert_type) {
      case InsertType.InsertOrIgnore:
        insert_text = "INSERT OR IGNORE";
        break;
    }

    const sql = `${insert_text} INTO ${table} (${columns}) VALUES (${valueplacehold})`;
    return sql;
  }

  /**
   * Method runs SQL INSERT INTO clause to add column/value pairs to table 'table' in database 'dbdata'.
   * Method returns 'id' of added row.
   *
   * @param table - table name
   * @param column_names - array of column names
   * @param column_values - array of column values
   */
  private async addRowCore(
    id: string,
    table: string,
    column_names: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    column_values: any[],
    insert_type: InsertType = InsertType.Insert
  ): Promise<LastIdReturnType> {
    // executes SQL query and calls callback for all rows
    const sql = this.getAddRowCoreSql(table, column_names, insert_type);

    const lastID: number | undefined =
      await /*database.run(sql, column_values)*/ this.execRetID(
        id,
        sql,
        ...column_values
      );

    if (/*stm.lastID*/ lastID) return /*stm.lastID*/ lastID;
    else throw new MissingLastIdError("Missing lastID");
  }

  //================================================================================================================

  /*
   * Method builds SQL UPDATE statement from table name and column names and columns for WHERE clause.
   * It returns SQL string.
   *
   * @param table - name of the table
   * @param column_names - array of column names to update
   * @param cond_col_names - array of columns names for WHERE clause
   */
  private getUpdateRowCoreSql(
    table: string,
    column_names: string[],
    cond_col_names: string[]
  ): string {
    const set_list = this.names2StringList(
      column_names,
      ", ",
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (s: string, indx: number, extra: unknown[]): string => {
        return `${s} = ${this.getSQLParameter(indx)}`;
      }
    );

    const cond = this.names2StringList(
      cond_col_names,
      " AND ",
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (s: string, indx: number, extra: unknown[]): string => {
        return `${s} = ${this.getSQLParameter(indx)}`;
      },
      undefined,
      column_names ? column_names.length : 0
    );

    const sql = `UPDATE ${table} SET ${set_list} WHERE ${cond}`;
    return sql;
  }

  /*
   * Method runs SQL UPDATE clause to update columns in table 'table' in database 'dbdata'.
   *
   * @param table - table name
   * @param column_names - array of column names
   * @param column_values - array of column values
   * @param cond_col_names - array of condition column names
   * @param cond_col_values - array of condition column values
   */
  private async updateRowCore(
    table: string,
    column_names: string[],
    column_values: unknown[],
    cond_col_names: string[],
    cond_col_values: unknown[]
  ): Promise<void> {
    // executes SQL query
    const sql = this.getUpdateRowCoreSql(table, column_names, cond_col_names);
    const values = column_values.concat(cond_col_values);

    await /*database.run(sql, values)*/ this.execRetVoid(sql, ...values);
  }

  //================================================================================================================

  /*
   * Method builds SQL DELETE FROM statement from table name and condition columns.
   * It returns SQL string.
   *
   * @param table - name of the table
   * @paran cond_col_names - names of columns used in WHERE clause
   */
  private getDeleteRowCoreSqlParams(
    table: string,
    cond_col_names: string[]
  ): string {
    const cond = this.names2StringList(
      cond_col_names,
      " AND ",
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (s: string, indx: number, extra: unknown[]): string => {
        return `${s} = ${this.getSQLParameter(indx)}`;
      }
    );

    const sql = `DELETE FROM ${table} WHERE ${cond}`;
    return sql;
  }

  /**
   * Method runs SQL DELETE FROM clause to delete from table 'table' in database 'dbdata'.
   *
   * @param table - table name
   * @paran cond_col_names - names of columns used in WHERE clause
   */
  private async deleteRowCore(
    table: string,
    cond_col_names: string[],
    cond_col_values: unknown[]
  ): Promise<void> {
    // executes SQL query
    const sql = this.getDeleteRowCoreSqlParams(table, cond_col_names);

    await /*database.run(sql, cond_col_values)*/ this.execRetVoid(
      sql,
      ...cond_col_values
    );
  }

  private _countParams(cond_col_values: (unknown | unknown[] | null)[]) {
    return cond_col_values.reduce((acc: number, val: unknown) => {
      if (val) {
        if (typeof val === "object" && val instanceof Array) {
          return acc + (val as unknown[]).length;
        } else {
          return acc + 1;
        }
      } else {
        return acc;
      }
    }, 0);
  }

  //================================================================================================================

  /*
   * Method get a row/rows from 'MovieGroupTypes' table
   *
   * @param tid - identifier of the type to get; when undefined all types are returned
   * @param limit - numbers of rows to retrieve for paging (tid is then ignored)
   * @param offset - offset of rows to tetrieve for paging (tid is then ignored)
   */
  async getMovieGroupTypes(
    tid: number | number[] | undefined,
    ex_column_names?: string[] | undefined,
    first?: number | undefined,
    after?: Record<string, unknown> | undefined,
    last?: number | undefined,
    before?: Record<string, unknown> | undefined,
    offset?: number | undefined
  ): Promise<IGetRowsFunReturn> {
    this._throwIfNotReady();

    if (tid !== undefined) {
      first = undefined;
      after = undefined;
      last = undefined;
      before = undefined;
      offset = undefined;
    }

    const moviegrouptype_tab = `${this.dbextra.moviegrouptype.getExtendedName()}`;
    const table_names = [moviegrouptype_tab];
    const id_column_names = [`${moviegrouptype_tab}._id`];
    const column_names = [
      ...id_column_names,
      `${moviegrouptype_tab}.name`,
      `${moviegrouptype_tab}.description`,
    ];

    const cond_col_names = typeof tid !== "undefined" ? id_column_names : [];
    const cond_col_values = typeof tid !== "undefined" ? [tid] : [];
    const join_conds: string[] = [];
    const extra_conds: string[] = [];

    const searchParans = this._findSearchParams(
      ["name", "_id"],
      first,
      after,
      last,
      before,
      offset,
      this._countParams(cond_col_values)
    );

    this._appendExColumnNames(
      column_names,
      moviegrouptype_tab,
      ex_column_names !== undefined
        ? ex_column_names.concat(searchParans.indexFields)
        : searchParans.indexFields
    );

    extra_conds.push(...searchParans.whereConds);

    const order_col_names = searchParans.orderByCols;

    let rows = await this.getRowsCore(
      table_names,
      column_names,
      cond_col_names,
      cond_col_values,
      join_conds,
      extra_conds,
      searchParans.whereParams,
      order_col_names,
      undefined,
      searchParans.limit,
      searchParans.offset
    );

    ({ rows, offset } = this._adjustRowsOffset(
      rows,
      searchParans.reversedOrder,
      last,
      offset
    ));

    const total_count_property = {
      total_count:
        rows.length > 0
          ? typeof rows[0]["count"] !== "undefined"
            ? rows[0]["count"]
            : 0
          : 0,
    };

    return {
      id_col_names: this.getListOfIdColNames(id_column_names),
      rows,
      ...total_count_property,
      reversedOrder: searchParans.reversedOrder,
      offset,
    };
  }

  /**
   * Method adds a new row to 'MovieGroupTypes' table and returns 'id' of inserted row as 'string'.
   *
   * @param column_names - array of column names
   * @param column_values - array of column values
   */
  async addMovieGroupType(
    column_names: string[],
    column_values: unknown[]
  ): Promise<LastIdReturnType> {
    this._throwIfNotReady();
    //console.log(`addMovieGroupType`);

    const ret = await this.addRowCore(
      "_id",
      `${this.dbextra.moviegrouptype.getExtendedName()}`,
      column_names,
      column_values
    );
    //console.log(`ret = ${ret}, typeof ret = ${typeof ret}`);
    return ret;
  }

  /**
   * Method updates movie group.
   *
   * @param tid - identifier of movie group type
   * @param column_names - array of column names
   * @param column_values - array of column values
   */
  async updateMovieGroupType(
    tid: number,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void> {
    this._throwIfNotReady();

    const cond_column_names = [`_id`];
    const cond_column_values = [tid];
    const tab_name = `${this.dbextra.moviegrouptype.getExtendedName()}`;

    await this.updateRowCore(
      tab_name,
      column_names,
      column_values,
      cond_column_names,
      cond_column_values
    );
  }

  /*
   * Method deletes type identified by 'tid'.
   *
   * @param tid - group identifier
   */
  async deleteMovieGroupType(tid: number): Promise<void> {
    this._throwIfNotReady();

    await this.beginTransaction();

    // make sure there are no groups referencing this type
    try {
      const gt_tab_names = [
        `${this.dbextra.moviegrouptypemoviegroup.getExtendedName()}`,
      ];
      const gt_col_names = [
        `${this.dbextra.moviegrouptypemoviegroup.getExtendedName()}.gendid`,
      ];
      const gt_cond_col_names = [
        `${this.dbextra.moviegrouptypemoviegroup.getExtendedName()}.gendid`,
      ];
      const gt_cond_col_values = [tid];
      const rows = await this.getRowsCore(
        gt_tab_names,
        gt_col_names,
        gt_cond_col_names,
        gt_cond_col_values,
        [],
        [],
        undefined,
        []
      );

      if (rows.length == 0) {
        // delete type
        const t_cond_col_names = [`_id`];
        const t_tab_name = `${this.dbextra.moviegrouptype.getExtendedName()}`;

        await this.deleteRowCore(t_tab_name, t_cond_col_names, [tid]);
        await this.commitTransaction();
      } else {
        throw new CannotDeleteUsedTypeError(
          `There are some groups referencing type=${tid}`
        );
      }
    } catch (e) {
      await this.rollbackTransaction();
      throw e;
    }
  }

  private _normalizeNumberParamArray(
    p: number | number[]
  ): number | null | (number | null)[] {
    if (typeof p === "number") {
      return p !== 0 ? p : null;
    } else {
      return (p as number[]).map((val: number) => (val !== 0 ? val : null));
    }
  }

  //================================================================================================================

  /*
   * Method get a row/rows from 'MovieGroups' table
   *
   * @param mgid - identifier of the group to get; when undefined all groups are returned
   * @param ex_column_names - names of additional columns to report
   * @param limit - numbers of rows to retrieve for paging (mgid is then ignored)
   * @param offset - offset of rows to tetrieve for paging (mgid is then ignored)
   */
  async getMovieGroups(
    tid: number | number[] | undefined,
    gid: number | number[] | undefined,
    ex_column_names?: string[] | undefined,
    first?: number | undefined,
    after?: Record<string, unknown> | undefined,
    last?: number | undefined,
    before?: Record<string, unknown> | undefined,
    offset?: number | undefined
  ): Promise<IGetRowsFunReturn> {
    this._throwIfNotReady();

    if (gid !== undefined) {
      first = undefined;
      after = undefined;
      last = undefined;
      before = undefined;
      offset = undefined;
    }

    // const paging =
    //   typeof limit !== "undefined" && typeof offset !== "undefined";
    // if (paging) gid = undefined;

    await this.beginTransaction();

    try {
      if (typeof gid === "undefined") {
        if (typeof tid !== "undefined" && tid !== 0) {
          const isTidArray = typeof tid === "object" && tid instanceof Array;
          let tid2;

          if (isTidArray) {
            // filter off 0
            tid2 = (tid as number[]).filter((val: number) => val !== 0);
          } else {
            tid2 = tid;
          }

          if ((tid2 as number[]).length > 0) {
            const rows0 = await this.getRowsCore(
              [this.dbextra.moviegrouptype.getExtendedName()],
              ["_id"],
              ["_id"],
              [tid2],
              [],
              [],
              undefined,
              []
            );

            if (isTidArray) {
              if (rows0.length !== (tid2 as number[]).length)
                throw new MissingGroupTypeError(`Missing group type: ${tid2}`);
            } else {
              if (rows0.length !== 1)
                throw new MissingGroupTypeError(`Missing group type: ${tid2}`);
            }
          }
        }
      }

      // TODO:
      //let validGroup = true;

      //if (typeof gid !== 'undefined') {
      //    const rows0 = await this.getRowsCore(this.db_parent, [this.dbextra.moviegrouptype.getQualifiedTableName()], ['_id'], ['_id'], [tid], [], [], []);

      //    validType = (rows0.length === 1);
      //}

      const playlistinfo_tab = `${this.dbplaylist.playlistinfo.getExtendedName()}`;
      const moviegrouptypemoviegroup_tab = `${this.dbextra.moviegrouptypemoviegroup.getExtendedName()}`;
      const table_names = [playlistinfo_tab, moviegrouptypemoviegroup_tab];
      const id_column_names = [`${playlistinfo_tab}._id`];
      const column_names = [
        ...id_column_names,
        `${playlistinfo_tab}.name`,
        `${moviegrouptypemoviegroup_tab}.gendid`,
      ];

      const cond_col_names =
        typeof gid !== "undefined"
          ? id_column_names
          : typeof tid !== "undefined"
          ? [`${moviegrouptypemoviegroup_tab}.gendid`]
          : [];
      const cond_col_values =
        typeof gid !== "undefined"
          ? [gid]
          : typeof tid !== "undefined"
          ? [this._normalizeNumberParamArray(tid)]
          : [];
      const join_conds = [
        `${playlistinfo_tab}._id = ${moviegrouptypemoviegroup_tab}.mgid`,
      ];
      const extra_conds: string[] = [];

      const searchParans = this._findSearchParams(
        ["name", "_id"],
        first,
        after,
        last,
        before,
        offset,
        this._countParams(cond_col_values)
      );

      this._appendExColumnNames(
        column_names,
        playlistinfo_tab,
        ex_column_names !== undefined
          ? ex_column_names.concat(searchParans.indexFields)
          : searchParans.indexFields
      );

      extra_conds.push(...searchParans.whereConds);

      const order_col_names = searchParans.orderByCols;

      let rows = await this.getRowsCore(
        table_names,
        column_names,
        cond_col_names,
        cond_col_values,
        join_conds,
        extra_conds,
        searchParans.whereParams,
        order_col_names,
        " LEFT JOIN ",
        searchParans.limit,
        searchParans.offset
      );

      ({ rows, offset } = this._adjustRowsOffset(
        rows,
        searchParans.reversedOrder,
        last,
        offset
      ));

      if (typeof gid !== "undefined") {
        if (rows.length !== 1)
          throw new MissingGroupError(`Missing group: ${gid}`);
      }

      const total_count_property = {
        total_count:
          rows.length > 0
            ? typeof rows[0]["count"] !== "undefined"
              ? rows[0]["count"]
              : 0
            : 0,
      };

      await this.commitTransaction();

      return {
        id_col_names: this.getListOfIdColNames(id_column_names),
        foreign_id_name: `gendid`,
        rows,
        ...total_count_property,
        reversedOrder: searchParans.reversedOrder,
        offset,
      };
    } catch (e) {
      //console.log(`$$ e.message = ${e.message}`)
      await this.rollbackTransaction();
      throw e;
    }
  }

  /**
   * Method adds a new movie group as a member of type group identified by 'ggid'.
   * It returns 'id' of new movie group id as string.
   *
   * @param tid - type group identifier (can be undefined)
   * @param templ - object implementing 'ITemplate' interface containing column/value pairs to use.
   */
  async addMovieGroup(
    tid: number | undefined,
    mid: string | undefined,
    column_names: string[],
    column_values: unknown[]
  ): Promise<LastIdReturnType> {
    this._throwIfNotReady();

    if (typeof tid !== "undefined" && tid !== 0) {
      await this.beginTransaction();

      // check if given type group exists
      try {
        const rows = await this.getRowsCore(
          [this.dbextra.moviegrouptype.getExtendedName()],
          ["_id"],
          ["_id"],
          [tid],
          [],
          [],
          undefined,
          []
        );

        if (rows.length !== 1)
          throw new MissingGroupTypeError(`Missing group type: ${tid}`);

        const d = new Date();
        const d_str = dateToUTCString(d);
        const compl_column_names = [
          "type",
          "addDate",
          "mediaDate",
          "modifyDate",
        ];
        const compl_column_values = [0, d_str, d_str, d_str];

        this.complementColumnsValues(
          column_names,
          column_values,
          compl_column_names,
          compl_column_values
        );
        const id = await this.addRowCore(
          "_id",
          this.dbplaylist.playlistinfo.getExtendedName(),
          column_names,
          column_values
        );

        await this.addRowCore(
          "mgid",
          this.dbextra.moviegrouptypemoviegroup.getExtendedName(),
          ["gendid", "mgid"],
          [tid, id]
        );

        await this.commitTransaction();
        return id;
      } catch (e) {
        await this.rollbackTransaction();
        throw e;
      }
      //===================
    } else if (typeof mid !== "undefined") {
      await this.beginTransaction();

      // check if given movie exists
      try {
        const movie_rows = await this.getRowsCore(
          [this.dbmoviemedia.media_info.getExtendedName()],
          ["_id", "title"],
          ["_id"],
          [mid],
          [],
          [],
          undefined,
          []
        );

        if (movie_rows.length !== 1) throw new Error(`Missing movie: ${mid}`);

        const d = new Date();
        const d_str = dateToUTCString(d);
        const compl_column_names = [
          "type",
          "addDate",
          "mediaDate",
          "modifyDate",
        ];
        const compl_column_values = [0, d_str, d_str, d_str];

        this.complementColumnsValues(
          column_names,
          column_values,
          compl_column_names,
          compl_column_values
        );
        const gid = await this.addRowCore(
          "_id",
          this.dbplaylist.playlistinfo.getExtendedName(),
          column_names,
          column_values
        );

        const media_id = this.mediaFullPath2id(
          mid.substr(MEDIA_INFO_PREFIX.length),
          PLAY_ITEM_INFO_PREFIX
        );

        const gmemb_column_names = ["mediaTitle", "mediaID", "playlistID"];
        const gmemb_column_values = [movie_rows[0]["title"], media_id, gid];
        const gmemb_compl_column_names = ["type", "listOrder"];
        const gmemb_compl_column_values = [1, 1]; // set 'listOrder' to 1 because there's only one movie in the new group

        this.complementColumnsValues(
          gmemb_column_names,
          gmemb_column_values,
          gmemb_compl_column_names,
          gmemb_compl_column_values
        );

        await this.addRowCore(
          "_id",
          this.dbplaylist.playiteminfo.getExtendedName(),
          gmemb_column_names,
          gmemb_column_values
        );

        await this.commitTransaction();
        return gid;
      } catch (e) {
        await this.rollbackTransaction();
        throw e;
      }
    } else {
      // when 'tid' & 'mid' are undefined
      const d = new Date();
      const d_str = dateToUTCString(d);
      const compl_column_names = ["type", "addDate", "mediaDate", "modifyDate"];
      const compl_column_values = [0, d_str, d_str, d_str];

      this.complementColumnsValues(
        column_names,
        column_values,
        compl_column_names,
        compl_column_values
      );
      const id = await this.addRowCore(
        "_id",
        this.dbplaylist.playlistinfo.getExtendedName(),
        column_names,
        column_values
      );
      return id;
    }
  }

  /**
   * Method updates movie group.
   *
   * @param gid - identifier of movie group
   * @param column_names - array of column names
   * @param column_values - array of column values
   */
  async updateMovieGroup(
    gid: number,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void> {
    this._throwIfNotReady();

    const d = new Date();
    const d_str = dateToUTCString(d);
    const cond_column_names = [`_id`];
    const cond_column_values = [gid];
    const g_tab_name = `${this.dbplaylist.playlistinfo.getExtendedName()}`;
    const compl_column_names = [`modifyDate`];
    const compl_column_values = [d_str];

    this.complementColumnsValues(
      column_names,
      column_values,
      compl_column_names,
      compl_column_values
    );

    await this.updateRowCore(
      g_tab_name,
      column_names,
      column_values,
      cond_column_names,
      cond_column_values
    );
  }

  /*
   * Method deletes group identified by 'gid'.
   *
   * @param gid - group identifier
   */
  async deleteMovieGroup(gid: number): Promise<void> {
    this._throwIfNotReady();

    await this.beginTransaction();

    // make sure that that no movie references this group
    try {
      const m_table_names = [
        `${this.dbplaylist.playiteminfo.getExtendedName()}`,
      ];
      const m_column_names = [
        `${this.dbplaylist.playiteminfo.getExtendedName()}.playlistID`,
      ];
      const m_cond_col_names = [
        `${this.dbplaylist.playiteminfo.getExtendedName()}.playlistID`,
      ];
      const m_cond_col_values = [gid];
      const rows = await this.getRowsCore(
        m_table_names,
        m_column_names,
        m_cond_col_names,
        m_cond_col_values,
        [],
        [],
        undefined,
        []
      );

      if (rows.length == 0) {
        // deleting group
        const g_cond_col_name = `_id`;
        const g_tab_name = `${this.dbplaylist.playlistinfo.getExtendedName()}`;

        await this.deleteRowCore(g_tab_name, [g_cond_col_name], [gid]);

        // deleting group extension referencing type
        const gt_cond_col_name = `mgid`;
        const gt_tab_name = `${this.dbextra.moviegrouptypemoviegroup.getExtendedName()}`;

        await this.deleteRowCore(gt_tab_name, [gt_cond_col_name], [gid]);

        await this.commitTransaction();
      } else {
        throw new Error("There are some movies referencing this group");
      }
    } catch (e) {
      await this.rollbackTransaction();
      throw e;
    }
  }

  /**
   * Method moves movie group 'gid' to another type 'new_tid'.
   *
   * @param gid - movie group identifier
   * @param new_tid - new type identifier
   */
  async moveMovieGroup2AnotherType(
    gid: number,
    new_tid: number
  ): Promise<void> {
    this._throwIfNotReady();

    await this.beginTransaction();

    try {
      const rows0 = await this.getRowsCore(
        [this.dbplaylist.playlistinfo.getExtendedName()],
        ["_id"],
        ["_id"],
        [gid],
        [],
        [],
        undefined,
        []
      );

      if (rows0.length === 1) {
        // check if the terget type=0 (type=0 is special and always exists [no type])
        if (new_tid === 0) {
          await this.deleteRowCore(
            this.dbextra.moviegrouptypemoviegroup.getExtendedName(),
            ["mgid"],
            [gid]
          );
          await this.commitTransaction();
        } else {
          const rows = await this.getRowsCore(
            [this.dbextra.moviegrouptype.getExtendedName()],
            ["_id"],
            ["_id"],
            [new_tid],
            [],
            [],
            undefined,
            []
          );

          if (rows.length === 1) {
            // check if there isn't type for given group
            const rows2 = await this.getRowsCore(
              [this.dbextra.moviegrouptypemoviegroup.getExtendedName()],
              ["mgid"],
              ["mgid"],
              [gid],
              [],
              [],
              undefined,
              []
            );

            if (rows2.length === 0) {
              await this.addRowCore(
                "mgid",
                this.dbextra.moviegrouptypemoviegroup.getExtendedName(),
                ["gendid", "mgid"],
                [new_tid, gid]
              );
            } else {
              await this.updateRowCore(
                this.dbextra.moviegrouptypemoviegroup.getExtendedName(),
                ["gendid"],
                [new_tid],
                ["mgid"],
                [gid]
              );
            }

            await this.commitTransaction();
          } else {
            throw new MissingGroupTypeError(`Missing group type: ${new_tid}`);
          }
        }
      } else {
        throw new MissingGroupError(`Missing group: ${gid}`);
      }
    } catch (e) {
      await this.rollbackTransaction();
      throw e;
    }
  }

  async moveMovieGroup2NoType(tid: number, gid: number): Promise<void> {
    this._throwIfNotReady();

    // const validType = true;

    await this.beginTransaction();

    try {
      if (typeof tid !== "undefined" && tid !== 0) {
        const rows0 = await this.getRowsCore(
          [this.dbextra.moviegrouptype.getExtendedName()],
          ["_id"],
          ["_id"],
          [tid],
          [],
          [],
          undefined,
          []
        );

        if (rows0.length !== 1)
          throw new MissingGroupTypeError(`Missing group type: ${tid}`);
      }

      await this.deleteRowCore(
        this.dbextra.moviegrouptypemoviegroup.getExtendedName(),
        ["mgid"],
        [gid]
      );
      await this.commitTransaction();
    } catch (e) {
      await this.rollbackTransaction();
      throw e;
    }
  }

  private _getColumnName(col: string) {
    const lastDotPos = col.lastIndexOf(".");

    if (lastDotPos !== -1) {
      col = col.substring(lastDotPos + 1); // column name without prefix
    }

    return col;
  }

  private _buildSearcWhere(
    indexFields: string[],
    cursor: Record<string, unknown>,
    isAfter: boolean,
    paramStartIndex: number
  ): ISearchWhere {
    const oper = isAfter ? ">" : "<";
    const params: unknown[] = [];

    const whereCond = indexFields.reduce(
      (cond: string, key: string, index: number, arr: string[]): string => {
        const colName = this._getColumnName(key);

        if (index > 0) {
          let eqCond = "";

          for (let i = 0; i < index; i++) {
            params.push(cursor[this._getColumnName(arr[i])]);
            eqCond +=
              i === 0
                ? `${arr[i]} = ${this.getSQLParameter(paramStartIndex++)}`
                : ` AND ${arr[i]} = ${this.getSQLParameter(paramStartIndex++)}`;
          }

          params.push(cursor[colName]);
          eqCond += ` AND ${arr[index]} ${oper} ${this.getSQLParameter(
            paramStartIndex++
          )}`;

          const finish = index < arr.length - 1 ? "" : ")";
          return `${cond} OR ${eqCond}${finish}`;
        } else {
          params.push(cursor[colName]);
          return arr.length > 1
            ? `(${colName} ${oper} ${this.getSQLParameter(paramStartIndex++)}`
            : `(${colName} ${oper} ${this.getSQLParameter(paramStartIndex++)})`;
        }
      },
      ""
    );

    return {
      whereCond,
      params,
    };
  }

  private _findSearchParams(
    indexFields: string[], // example: ["title", "_id"]
    first: number | undefined,
    after: Record<string, unknown> | undefined,
    last: number | undefined,
    before: Record<string, unknown> | undefined,
    offset: number | undefined,
    paramStartIndex: number
  ): ISearchParams {
    const whereConds: string[] = [];
    const whereParams: unknown[] = [];

    const whereCondAfter =
      after !== undefined
        ? this._buildSearcWhere(indexFields, after, true, paramStartIndex)
        : undefined;
    if (whereCondAfter) {
      whereConds.push(whereCondAfter.whereCond);
      whereParams.push(...whereCondAfter.params);
    }

    // check if before cursor is inside edges
    let beforeIsInside = true;

    if (after && before) {
      beforeIsInside = false;

      for (let i = 0; i < indexFields.length; i++) {
        const key = this._getColumnName(indexFields[i]);

        if (typeof before[key] === "string") {
          if ((before[key] as string).localeCompare(after[key] as string) > 0) {
            beforeIsInside = true;
            break;
          } else if (
            (before[key] as string).localeCompare(after[key] as string) < 0
          ) {
            break;
          }
        } else if (typeof before[key] === "number") {
          if ((before[key] as number) > (after[key] as number)) {
            beforeIsInside = true;
            break;
          } else if ((before[key] as number) < (after[key] as number)) {
            break;
          }
        } else if (typeof before[key] === "bigint") {
          if ((before[key] as bigint) > (after[key] as bigint)) {
            beforeIsInside = true;
            break;
          } else if ((before[key] as bigint) < (after[key] as bigint)) {
            break;
          }
        } else if (typeof before[key] === "boolean") {
          if ((before[key] as boolean) > (after[key] as boolean)) {
            beforeIsInside = true;
            break;
          } else if ((before[key] as boolean) < (after[key] as boolean)) {
            break;
          }
        }
      }
    }

    if (beforeIsInside) {
      const whereBeforeCond =
        before !== undefined
          ? this._buildSearcWhere(indexFields, before, false, paramStartIndex)
          : undefined;
      if (whereBeforeCond) {
        whereConds.push(whereBeforeCond.whereCond);
        whereParams.push(...whereBeforeCond.params);
      }
    }

    const reversedOrder = first === undefined && last !== undefined;
    const limit = reversedOrder ? last : first;
    const orderByCols = reversedOrder
      ? indexFields.map((key) => `${key} DESC`)
      : [...indexFields];

    return {
      indexFields,
      whereConds,
      whereParams,
      orderByCols,
      reversedOrder,
      limit,
      offset: after === undefined && before === undefined ? offset : undefined,
    };
  }

  private _adjustRowsOffset(
    rows: RowObject[],
    reversedOrder: boolean,
    last: number | undefined,
    offset: number | undefined
  ): IAdjustRowsResult {
    if (reversedOrder) rows.reverse();

    if (last !== undefined && last < rows.length) {
      offset = rows.length - last;
      rows = rows.slice(offset);
    }

    return { rows, offset };
  }

  /*
   * Method get a row/rows from 'Movie' table
   *
   * @param gid - group of movies
   * @param mid - identifier of the movie to get; when undefined all movies are returned
   * @param ex_column_names - either in 'media_info' when "gid" is "undefined" or in "playiteminfo" otherwise
   * @param limit - numbers of rows to retrieve for paging (tid is then ignored)
   * @param offset - offset of rows to tetrieve for paging (tid is then ignored)
   */
  async getMovies(
    gid: number | number[] | undefined,
    mid: string | number[] | undefined,
    ex_column_names?: string[] | undefined,
    first?: number | undefined,
    after?: Record<string, unknown> | undefined,
    last?: number | undefined,
    before?: Record<string, unknown> | undefined,
    offset?: number | undefined
  ): Promise<IGetRowsFunReturn> {
    this._throwIfNotReady();

    if (mid !== undefined) {
      first = undefined;
      after = undefined;
      last = undefined;
      before = undefined;
      offset = undefined;
    }

    const movie_tab = `${this.dbmoviemedia.media_info.getExtendedName()}`;
    const playiteminfo_tab = `${this.dbplaylist.playiteminfo.getExtendedName()}`;

    // const withClause = USE_FOLDER_COLUMN_IN_MOVIES
    //   ? `WITH MediaInfo5 AS (WITH MediaInfo4 AS
    //                 (WITH MediaInfo3 AS
    //                 (WITH MediaInfo2 AS (SELECT rowid, rtrim(_id, replace(_id, '\\', '')) AS _id2 FROM ${movie_tab})
    //                 SELECT rowid, substr(_id2, 0, length(_id2)) AS _id3 FROM MediaInfo2)
    //                 SELECT rowid, replace(_id3, rtrim(_id3, replace(_id3, '\\', '')), '') AS _id4 FROM MediaInfo3)
    //                 SELECT rowid, replace(_id4, ';', ':') AS folder FROM MediaInfo4)`
    //   : ``;
    const withClause = USE_FOLDER_COLUMN_IN_MOVIES
      ? `WITH MediaInfo5 AS (WITH MediaInfo4 AS 
                    (WITH MediaInfo3 AS
                    (WITH MediaInfo2 AS (SELECT _id as _rowid, rtrim(_id, replace(_id, '\\', '')) AS _id2 FROM ${movie_tab})
                    SELECT _rowid, substr(_id2, 0, length(_id2)) AS _id3 FROM MediaInfo2)
                    SELECT _rowid, replace(_id3, rtrim(_id3, replace(_id3, '\\', '')), '') AS _id4 FROM MediaInfo3)
                    SELECT _rowid, replace(_id4, ';', ':') AS folder FROM MediaInfo4)`
      : ``;

    const table_names = USE_FOLDER_COLUMN_IN_MOVIES
      ? typeof gid !== "undefined"
        ? [`MediaInfo5`, movie_tab, playiteminfo_tab]
        : [`MediaInfo5`, movie_tab]
      : typeof gid !== "undefined"
      ? [movie_tab, playiteminfo_tab]
      : [movie_tab];

    const id_column_names = [`${movie_tab}._id`];

    const column_names = USE_FOLDER_COLUMN_IN_MOVIES
      ? typeof gid !== "undefined"
        ? // movies in given group
          [
            ...id_column_names,
            `${movie_tab}.title`,
            `${movie_tab}.mediaFullPath`,
            `MediaInfo5.folder`,
            `${playiteminfo_tab}.playlistID`,
            `${playiteminfo_tab}.listOrder`,
          ]
        : // all movies
          [
            ...id_column_names,
            `${movie_tab}.title`,
            `${movie_tab}.mediaFullPath`,
            `MediaInfo5.folder`,
          ]
      : typeof gid !== "undefined"
      ? // movies in given group
        [
          ...id_column_names,
          `${movie_tab}.title`,
          `${movie_tab}.mediaFullPath` /*, `${playiteminfo_tab}.playlistID`*/,
          `${playiteminfo_tab}.listOrder`,
        ]
      : // all movies
        [
          ...id_column_names,
          `${movie_tab}.title`,
          `${movie_tab}.mediaFullPath`,
        ];

    const cond_col_names =
      typeof mid !== "undefined"
        ? id_column_names
        : typeof gid !== "undefined"
        ? [`${playiteminfo_tab}.playlistID`]
        : [];
    const cond_col_values =
      typeof mid !== "undefined"
        ? [mid]
        : typeof gid !== "undefined"
        ? [this._normalizeNumberParamArray(gid)]
        : [];

    const join_conds: string[] = [];

    // const extra_conds = USE_FOLDER_COLUMN_IN_MOVIES
    //   ? typeof gid !== "undefined"
    //     ? [
    //         `MediaInfo5.rowid = ${movie_tab}.rowid`,
    //         `substr(${movie_tab}._id, ${MEDIA_INFO_PREFIX.length}) = substr(${playiteminfo_tab}.mediaID, ${PLAY_ITEM_INFO_PREFIX.length})`,
    //       ]
    //     : [`MediaInfo5.rowid = ${movie_tab}.rowid`]
    //   : typeof gid !== "undefined"
    //   ? [
    //       `substr(${movie_tab}._id, ${MEDIA_INFO_PREFIX.length}) = substr(${playiteminfo_tab}.mediaID, ${PLAY_ITEM_INFO_PREFIX.length})`,
    //     ]
    //   : [];
    const extra_conds = USE_FOLDER_COLUMN_IN_MOVIES
      ? typeof gid !== "undefined"
        ? [
            `MediaInfo5._rowid = ${movie_tab}._id`,
            `substr(${movie_tab}._id, ${MEDIA_INFO_PREFIX.length}) = substr(${playiteminfo_tab}.mediaID, ${PLAY_ITEM_INFO_PREFIX.length})`,
          ]
        : [`MediaInfo5._rowid = ${movie_tab}._id`]
      : typeof gid !== "undefined"
      ? [
          `substr(${movie_tab}._id, ${MEDIA_INFO_PREFIX.length}) = substr(${playiteminfo_tab}.mediaID, ${PLAY_ITEM_INFO_PREFIX.length})`,
        ]
      : [];

    const searchParans =
      mid !== undefined || gid === undefined
        ? this._findSearchParams(
            ["title", "_id"],
            first,
            after,
            last,
            before,
            offset,
            this._countParams(cond_col_values)
          )
        : this._findSearchParams(
            ["listOrder"],
            first,
            after,
            last,
            before,
            offset,
            this._countParams(cond_col_values)
          );

    this._appendExColumnNames(
      column_names,
      (colName: string) => {
        colName = colName.toLowerCase();

        if (
          colName === "type" ||
          colName === "type" ||
          colName === "mediatitle" ||
          colName === "mediaid" ||
          colName === "playlistid"
        ) {
          return playiteminfo_tab;
        } else {
          return movie_tab;
        }
      },
      ex_column_names
    );

    extra_conds.push(...searchParans.whereConds);

    const order_col_names = searchParans.orderByCols;
    // typeof mid !== "undefined" || typeof gid === "undefined"
    //   ? searchParans.orderByCols
    //   : [/*`playlistID`,*/ `listOrder`];

    let rows = await this.getRowsCore(
      table_names,
      column_names,
      cond_col_names,
      cond_col_values,
      join_conds,
      extra_conds,
      searchParans.whereParams,
      order_col_names,
      undefined,
      searchParans.limit,
      searchParans.offset,
      undefined,
      withClause
    );

    ({ rows, offset } = this._adjustRowsOffset(
      rows,
      searchParans.reversedOrder,
      last,
      offset
    ));

    const total_count_property = {
      total_count:
        rows.length > 0
          ? typeof rows[0]["count"] !== "undefined"
            ? rows[0]["count"]
            : 0
          : 0,
    };

    return {
      id_col_names: this.getListOfIdColNames(id_column_names),
      rows,
      ...total_count_property,
      reversedOrder: searchParans.reversedOrder,
      offset,
    };
  }

  private mediaFullPath2id(mediaFullPath: string, prefix: string): string {
    return `${prefix}${mediaFullPath}`;
  }

  // Note: this is called within a transaction hence DO NOT BEGIN TRANSATION HERE
  private async prepareForGroupElemInsertion(
    gid: number,
    new_listOrder?: number
  ): Promise<number> {
    this._throwIfNotReady();

    // find number of elements in the group
    const group_member_rows = await this.getRowsCore(
      [this.dbplaylist.playiteminfo.getExtendedName()],
      ["count(listOrder) AS count"],
      ["playlistID"],
      [gid],
      [],
      [],
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      ""
    );
    const count =
      group_member_rows[0]["count"] != null ? group_member_rows[0]["count"] : 0;

    // adjust 'new_listOrder' if necessary
    if (typeof new_listOrder == "undefined" || new_listOrder > count) {
      new_listOrder = count + 1;
    } else if (new_listOrder < 1) {
      new_listOrder = 1;
    }
    // ${this.dbextra.moviegrouptypemoviegroup.getExtendedName()}

    const playiteminfo_tab = this.dbplaylist.playiteminfo.getExtendedName();

    // renumber items in current group & make slot for a new element
    const sql_renumber =
      `WITH NewSequence AS ` +
      `(` +
      `SELECT _id, listOrder, row_number() OVER (ORDER BY listOrder) listOrder2 ` +
      `FROM ${playiteminfo_tab} ` +
      `WHERE ${playiteminfo_tab}.playlistID = ${this.getSQLParameter(0)}` +
      `) ` +
      `UPDATE ${this.dbplaylist.playiteminfo.getExtendedName()} SET (listOrder) = ` +
      `(SELECT CASE WHEN (listOrder2 < ${this.getSQLParameter(
        1
      )}) THEN listOrder2 ELSE listOrder2 + 1 END ` +
      `FROM NewSequence ` +
      `WHERE ${playiteminfo_tab}._id = NewSequence._id) ` +
      `WHERE ${playiteminfo_tab}.playlistID = ${this.getSQLParameter(2)}`;

    await this.execRetVoid(sql_renumber, ...[gid, new_listOrder, gid]); // Note: gid is repeated

    return new_listOrder;
  }

  /**
   * Method adds a new row to 'Movies' table and returns 'id' of inserted row.
   *
   * @param column_names - array of column names
   * @param column_values - array of column values
   */
  async addMovie(
    gid: number | undefined,
    new_listOrder: number | undefined,
    column_names: string[],
    column_values: unknown[] /*, mediaFullPath: string*/
  ): Promise<string> {
    this._throwIfNotReady();
    // throw new Error('Missing mediaFullPath column');

    let bFound = false;
    let mediaFullPath = "";
    let indx = 0;

    for (const value of column_names) {
      if (value === "mediaFullPath") {
        bFound = true;
        mediaFullPath = column_values[indx] as string;
        break;
      }

      indx++;
    }

    if (!bFound) throw new Error("Missing mediaFullPath column");

    if (typeof gid !== "undefined" && gid !== 0) {
      await this.beginTransaction();

      // check if given group exists
      try {
        const group_rows = await this.getRowsCore(
          [this.dbplaylist.playlistinfo.getExtendedName()],
          ["_id"],
          ["_id"],
          [gid],
          [],
          [],
          undefined,
          []
        );

        if (group_rows.length !== 1) throw new Error(`Missing group: ${gid}`);
        const d = new Date();
        const d_str = dateToUTCString(d);
        const id = this.mediaFullPath2id(mediaFullPath, MEDIA_INFO_PREFIX);
        const compl_column_names = [
          "modifyDate",
          "mediaSize",
          "mediaType",
          "playDate",
          "addDate",
          "_id",
        ];
        const compl_column_values = [d_str, 0, 1, d_str, d_str, id];

        this.complementColumnsValues(
          column_names,
          column_values,
          compl_column_names,
          compl_column_values
        );

        await this.addRowCore(
          "_id",
          `${this.dbmoviemedia.media_info.getExtendedName()}`,
          column_names,
          column_values
        );

        new_listOrder = await this.prepareForGroupElemInsertion(
          gid,
          new_listOrder
        );

        // find column values copied from 'media_info' table
        let media_title = "";

        for (let i = 0; i < column_names.length; i++) {
          if (column_names[i] === "title") {
            media_title = column_values[i] as string;
            break;
          }
        }

        const media_id = this.mediaFullPath2id(
          mediaFullPath,
          PLAY_ITEM_INFO_PREFIX
        );

        const gmemb_column_names = ["mediaTitle", "mediaID", "playlistID"];
        const gmemb_column_values = [media_title, media_id, gid];
        const gmemb_compl_column_names = ["type", "listOrder"];
        const gmemb_compl_column_values = [1, new_listOrder];

        this.complementColumnsValues(
          gmemb_column_names,
          gmemb_column_values,
          gmemb_compl_column_names,
          gmemb_compl_column_values
        );

        await this.addRowCore(
          "_id",
          this.dbplaylist.playiteminfo.getExtendedName(),
          gmemb_column_names,
          gmemb_column_values
        );

        await this.commitTransaction();

        return id;
      } catch (e) {
        await this.rollbackTransaction();
        throw e;
      }
    } else {
      const d = new Date();
      const d_str = dateToUTCString(d);
      const id = this.mediaFullPath2id(mediaFullPath, MEDIA_INFO_PREFIX);
      const compl_column_names = [
        "modifyDate",
        "mediaSize",
        "mediaType",
        "playDate",
        "addDate",
        "_id",
      ];
      const compl_column_values = [d_str, 0, 0, d_str, d_str, id];

      this.complementColumnsValues(
        column_names,
        column_values,
        compl_column_names,
        compl_column_values
      );

      await this.addRowCore(
        "_id",
        `${this.dbmoviemedia.media_info.getExtendedName()}`,
        column_names,
        column_values
      );

      return id;
    }
  }

  /**
   * Method updates movie.
   *
   * @param mid - identifier of movie
   * @param column_names - array of column names
   * @param column_values - array of column values
   */
  async updateMovie(
    mid: string,
    column_names: string[],
    column_values: unknown[]
  ): Promise<void> {
    this._throwIfNotReady();

    const cond_column_names = [`_id`];
    const cond_column_values = [mid];
    const tab_name = `${this.dbmoviemedia.media_info.getExtendedName()}`;

    await this.updateRowCore(
      tab_name,
      column_names,
      column_values,
      cond_column_names,
      cond_column_values
    );
  }

  /*
   * Method deletes movie identified by 'mid'.
   *
   * @param mid - group identifier
   */
  async deleteMovie(mid: string): Promise<void> {
    this._throwIfNotReady();

    await this.beginTransaction();

    // delete type
    try {
      const t_cond_col_names = [`_id`];
      const t_tab_name = `${this.dbmoviemedia.media_info.getExtendedName()}`;

      await this.deleteRowCore(t_tab_name, t_cond_col_names, [mid]);
      await this.commitTransaction();
    } catch (e) {
      await this.rollbackTransaction();
      throw e;
    }
  }

  // movie icon
  // async getMovieIcon(mid: string, sendMovieIcon: ISendMovieIconFun, res: express.Response): Promise<void> {
  //  this._throwIfNotReady();

  //     await this.beginTransaction();

  //     try {
  //         const rows: RowObject[] = await this.getRowsCore([this.dbmoviemedia.media_info.getExtendedName()], ['_id'], ['_id'], [mid], [], [], []);

  //         if (rows.length !== 1) throw new MissingMovieError("Missing movie: " + mid);

  //         const thumbDir: string = dirname(mid.substr(MEDIA_INFO_PREFIX.length)) + "\\thumbnail";
  //         await sendMovieIcon(thumbDir, res);
  //         await this.commitTransaction();
  //     }
  //     catch (e) {
  //         await this.rollbackTransaction();
  //         throw e;
  //     }
  // };

  // async updateMovieIcon(mid: string, storeMovieIcon: IStoreMovieIconFun, req: express.Request, res: express.Response): Promise<void> {
  //   this._throwIfNotReady();

  //     await this.beginTransaction();

  //     try {
  //         const rows: RowObject[] = await this.getRowsCore([this.dbmoviemedia.media_info.getExtendedName()], ['_id'], ['_id'], [mid], [], [], []);

  //         if (rows.length !== 1) throw new MissingMovieError("Missing movie: " + mid);

  //         const thumbDir: string = dirname(mid.substr(MEDIA_INFO_PREFIX.length)) + "\\thumbnail";
  //         await storeMovieIcon(thumbDir, req, res);
  //         await this.commitTransaction();
  //     }
  //     catch (e) {
  //         await this.rollbackTransaction();
  //     }
  // };

  // async deleteMovieIcon(mid: string, removeMovieIcon: IRemoveMovieIconFun): Promise<void> {
  //   this._throwIfNotReady();

  //     await this.beginTransaction();

  //     try {
  //         const rows: RowObject[] = await this.getRowsCore([this.dbmoviemedia.media_info.getExtendedName()], ['_id'], ['_id'], [mid], [], [], []);

  //         if (rows.length !== 1) throw new MissingMovieError("Missing movie: " + mid);

  //         const thumbDir: string = dirname(mid.substr(MEDIA_INFO_PREFIX.length)) + "\\thumbnail";
  //         await removeMovieIcon(thumbDir);
  //         await this.commitTransaction();
  //     }
  //     catch (e) {
  //         this.rollbackTransaction();
  //         throw e;
  //     }
  // };

  /**
   * Method marks movie 'mid' a member of group 'new_gid'.
   *
   * @param mid - movie identifier
   * @param new_gid - group identifier
   */
  async markMovieGroupMember(
    mid: string,
    new_gid: number,
    new_listOrder?: number
  ): Promise<void> {
    this._throwIfNotReady();

    await this.beginTransaction();

    try {
      // check if demanded group exists
      const group_rows = await this.getRowsCore(
        [this.dbplaylist.playlistinfo.getExtendedName()],
        ["_id"],
        ["_id"],
        [new_gid],
        [],
        [],
        undefined,
        []
      );

      if (group_rows.length !== 1) throw new Error(`Missing group: ${new_gid}`);

      // check if the movie exists
      const movie_rows = await this.getRowsCore(
        [this.dbmoviemedia.media_info.getExtendedName()],
        ["title"],
        [`_id`],
        [mid],
        [],
        [],
        undefined,
        []
      );

      if (movie_rows.length !== 1) throw new Error("Missing movie");

      const media_id = this.mediaFullPath2id(
        mid.substr(MEDIA_INFO_PREFIX.length),
        PLAY_ITEM_INFO_PREFIX
      );

      // check if the row already exists
      const flag_rows = await this.getRowsCore(
        [this.dbplaylist.playiteminfo.getExtendedName()],
        ["_id"],
        ["playlistID", `mediaID`],
        [new_gid, media_id],
        [],
        [],
        undefined,
        []
      );

      const bUpdateListOrder = typeof new_listOrder !== "undefined";
      new_listOrder = await this.prepareForGroupElemInsertion(
        new_gid,
        new_listOrder
      );

      if (flag_rows.length == 0) {
        const gmemb_column_names = ["mediaTitle", "mediaID", "playlistID"];
        const gmemb_column_values = [movie_rows[0]["title"], media_id, new_gid];
        const gmemb_compl_column_names = ["type", "listOrder"];
        const gmemb_compl_column_values = [1, new_listOrder];

        this.complementColumnsValues(
          gmemb_column_names,
          gmemb_column_values,
          gmemb_compl_column_names,
          gmemb_compl_column_values
        );

        await this.addRowCore(
          "_id",
          this.dbplaylist.playiteminfo.getExtendedName(),
          gmemb_column_names,
          gmemb_column_values
        );
      }

      await this.updateRowCore(
        this.dbplaylist.playiteminfo.getExtendedName(),
        bUpdateListOrder ? ["mediaTitle", "listOrder"] : ["mediaTitle"],
        bUpdateListOrder
          ? [movie_rows[0]["title"], new_listOrder]
          : [movie_rows[0]["title"]],
        [`mediaID`],
        [media_id]
      );
      await this.commitTransaction();
    } catch (e) {
      await this.rollbackTransaction();
      throw e;
    }
  }

  async unmarkMovieGroupMember(gid: number, mid: string): Promise<void> {
    this._throwIfNotReady();

    const media_id = this.mediaFullPath2id(
      mid.substr(MEDIA_INFO_PREFIX.length),
      PLAY_ITEM_INFO_PREFIX
    );

    await this.beginTransaction();

    try {
      await this.deleteRowCore(
        this.dbplaylist.playiteminfo.getExtendedName(),
        ["playlistID", "mediaID"],
        [gid, media_id]
      );

      await this.prepareForGroupElemInsertion(gid); // to renumber only
      await this.commitTransaction();
    } catch (e) {
      await this.rollbackTransaction();
      throw e;
    }
  }

  /*
   * Method get a row/rows from 'MovieGroups' table filtered by movie identifier 'mid'
   *
   * @param mid - identifier of filtering movie;
   * @param limit - numbers of rows to retrieve for paging (mgid is then ignored)
   * @param offset - offset of rows to tetrieve for paging (mgid is then ignored)
   */
  async getGroupsOfMovie(
    mid: string | string[],
    ex_column_names?: string[] | undefined,
    first?: number | undefined,
    after?: Record<string, unknown> | undefined,
    last?: number | undefined,
    before?: Record<string, unknown> | undefined,
    offset?: number | undefined
  ): Promise<IGetRowsFunReturn> {
    this._throwIfNotReady();

    // const paging =
    //   typeof limit !== "undefined" && typeof offset !== "undefined";

    const playlistinfo_tab = `${this.dbplaylist.playlistinfo.getExtendedName()}`;
    const playiteminfo_tab = `${this.dbplaylist.playiteminfo.getExtendedName()}`;
    const moviegrouptypemoviegroup_tab = `${this.dbextra.moviegrouptypemoviegroup.getExtendedName()}`;
    const table_names = [
      playlistinfo_tab,
      playiteminfo_tab,
      moviegrouptypemoviegroup_tab,
    ];
    const id_column_names = [`${playlistinfo_tab}._id`];
    const column_names = [
      ...id_column_names,
      `${playlistinfo_tab}.name`,
      `'${MEDIA_INFO_PREFIX}' || SUBSTR(${playiteminfo_tab}.mediaid, ${
        PLAY_ITEM_INFO_PREFIX.length + 1
      }) AS mid`,
      `${moviegrouptypemoviegroup_tab}.gendid`,
    ];

    const cond_col_names = [`mediaID`];
    const media_id =
      typeof mid === "string"
        ? this.mediaFullPath2id(
            mid.substring(MEDIA_INFO_PREFIX.length),
            PLAY_ITEM_INFO_PREFIX
          )
        : (mid as string[]).map((item) =>
            this.mediaFullPath2id(
              item.substring(MEDIA_INFO_PREFIX.length),
              PLAY_ITEM_INFO_PREFIX
            )
          );
    const cond_col_values = [media_id];
    const join_conds = [
      `${playlistinfo_tab}._id = ${playiteminfo_tab}.playlistID`,
      `${playlistinfo_tab}._id = ${moviegrouptypemoviegroup_tab}.mgid`,
    ];
    const extra_conds: string[] = [];

    const searchParans = this._findSearchParams(
      [`${playlistinfo_tab}.name`, `${playlistinfo_tab}._id`],
      first,
      after,
      last,
      before,
      offset,
      this._countParams(cond_col_values)
    );

    this._appendExColumnNames(column_names, playlistinfo_tab, ex_column_names);

    this._appendExColumnNames(
      column_names,
      undefined,
      searchParans.indexFields
    );

    extra_conds.push(...searchParans.whereConds);

    const order_col_names = searchParans.orderByCols;

    //    const order_col_names = [`PlayListInfo.name`];

    //console.log(`media_id=${media_id}`);
    let rows = await this.getRowsCore(
      table_names,
      column_names,
      cond_col_names,
      cond_col_values,
      join_conds,
      extra_conds,
      searchParans.whereParams,
      order_col_names,
      [" JOIN ", " LEFT JOIN "],
      searchParans.limit,
      searchParans.offset
    );

    ({ rows, offset } = this._adjustRowsOffset(
      rows,
      searchParans.reversedOrder,
      last,
      offset
    ));

    const total_count_property = {
      total_count:
        rows.length > 0
          ? typeof rows[0]["count"] !== "undefined"
            ? rows[0]["count"]
            : 0
          : 0,
    };

    return {
      id_col_names: this.getListOfIdColNames(id_column_names),
      foreign_id_name: `gendid`,
      rows,
      ...total_count_property,
      reversedOrder: searchParans.reversedOrder,
      offset,
    };
  }
}

//export const dbdata_manager_instance = new DBDataMovieManager();
