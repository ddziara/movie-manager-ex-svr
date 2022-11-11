import { DBDataMovieManagerCyberlink } from "../database/db-data-moviemanager-cyberlink";
import type { Knex } from "knex";

describe("Checking DBDataMovieManager class", () => {
  test(`checking _buildSearcWhere() method when single key and after mode`, async () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const indexFields = ["_id"];
    const cursor = { _id: "MOVIE_C_Some Movie" };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);
    expect(whereCond.params).toEqual([cursor["_id"]]);
    expect(whereCond.whereCond).toBe("(_id > ?)");
  });

  test(`checking _buildSearcWhere() method when single key and before mode`, async () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const indexFields = ["_id"];
    const cursor = { _id: "MOVIE_C_Some Movie" };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, false, 0);
    expect(whereCond.params).toEqual([cursor["_id"]]);
    expect(whereCond.whereCond).toBe("(_id < ?)");
  });

  test(`checking _buildSearcWhere() method when two keys and after mode`, async () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const indexFields = ["title", "_id"];
    const cursor = { title: "Some Movie", _id: "MOVIE_C_Some Movie" };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);
    expect(whereCond.params).toEqual([cursor["title"], cursor["title"], cursor["_id"]]);
    expect(whereCond.whereCond).toBe("(title > ? OR title = ? AND _id > ?)");
  });

  test(`checking _buildSearcWhere() method when when keys and after mode`, async () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const indexFields = ["title", "_id", "path"];
    const cursor = { title: "Some Movie", _id: "MOVIE_C_Some Movie", path: "C:\\Movies" };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);
    expect(whereCond.params).toEqual([cursor["title"], cursor["title"], cursor["_id"], cursor["title"], cursor["_id"], cursor["path"]]);
    expect(whereCond.whereCond).toBe("(title > ? OR title = ? AND _id > ? OR title = ? AND _id = ? AND path > ?)");
  });

  //=========================================================
  test(`checking getGetRowsCoreSql() method - test #1`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups"];
    const column_names = ["name"];
    const cond_col_names: string[] = [];
    const cond_col_values: unknown[] = [];
    const join_conds: string[] = [];
    const extra_conds: string[] = [];
    const filter_conds: string[] = [];
    const cursor_conds: string[] = [];
    const order_col_names: string[] = [];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups) SELECT name, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, tab_total_count UNION ALL SELECT '' AS name, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #2`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups"];
    const column_names = ["name"];
    const cond_col_names: string[] = ["name"];
    const cond_col_values: unknown[] = ["Herman"];
    const join_conds: string[] = [];
    const extra_conds: string[] = [];
    const filter_conds: string[] = [];
    const cursor_conds: string[] = [];
    const order_col_names: string[] = [];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups WHERE name = ${dbMan["getSQLParameter"](paramIndex++)}) SELECT name, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, tab_total_count WHERE name = ${dbMan["getSQLParameter"](paramIndex++)} UNION ALL SELECT '' AS name, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #3`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups"];
    const column_names = ["name"];
    const cond_col_names: string[] = ["name", "description"];
    const cond_col_values: unknown[] = ["Herman", null];
    const join_conds: string[] = [];
    const extra_conds: string[] = [];
    const filter_conds: string[] = [];
    const cursor_conds: string[] = [];
    const order_col_names: string[] = [];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups WHERE name = ${dbMan["getSQLParameter"](paramIndex++)} AND description IS NULL) SELECT name, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, tab_total_count WHERE name = ${dbMan["getSQLParameter"](paramIndex++)} AND description IS NULL UNION ALL SELECT '' AS name, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #4`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups"];
    const column_names = ["name"];
    const cond_col_names: string[] = ["name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = [];
    const extra_conds: string[] = [];
    const filter_conds: string[] = [];
    const cursor_conds: string[] = [];
    const order_col_names: string[] = [];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups WHERE (name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR name IS NULL)) SELECT name, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, tab_total_count WHERE (name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR name IS NULL) UNION ALL SELECT '' AS name, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #5`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = [];
    const filter_conds: string[] = [];
    const cursor_conds: string[] = [];
    const order_col_names: string[] = [];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id) SELECT groups.name, groups_extra.info, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, groups_extra, tab_total_count WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id UNION ALL SELECT '' AS name, '' AS info, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #6`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = [];
    const filter_conds: string[] = [];
    const cursor_conds: string[] = [];
    const order_col_names: string[] = [];
    const join_separators = [" LEFT JOIN "];
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups${join_separators[0]}groups_extra ON groups._id = groups_extra._id WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL)) SELECT groups.name, groups_extra.info, tab_total_count.total_count, COUNT(*) OVER() count FROM groups${join_separators[0]}groups_extra ON groups._id = groups_extra._id JOIN tab_total_count ON TRUE WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) UNION ALL SELECT '' AS name, '' AS info, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #7`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = ["groups.name = groups.description"];
    const filter_conds: string[] = [];
    const cursor_conds: string[] = [];
    const order_col_names: string[] = [];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name = groups.description) SELECT groups.name, groups_extra.info, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, groups_extra, tab_total_count WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name = groups.description UNION ALL SELECT '' AS name, '' AS info, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #8`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = ["groups.name = groups.description"];
    const filter_conds: string[] = ["groups.name LIKE '%?%'"];
    const cursor_conds: string[] = [];
    const order_col_names: string[] = [];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description) SELECT groups.name, groups_extra.info, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, groups_extra, tab_total_count WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description UNION ALL SELECT '' AS name, '' AS info, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #9`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = ["groups.name = groups.description"];
    const filter_conds: string[] = ["groups.name LIKE '%?%'"];
    //=============================================
    const indexFields = ["groups.name", "groups._id"];
    const cursor = { "groups.name": "Some Group", "groups._id": 1214355 };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);

    const cursor_conds: string[] = [whereCond.whereCond];
    //=============================================
    const order_col_names: string[] = [];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description) SELECT groups.name, groups_extra.info, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, groups_extra, tab_total_count WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description AND ${whereCond.whereCond} UNION ALL SELECT '' AS name, '' AS info, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC`)
  });

  test(`checking getGetRowsCoreSql() method - test #10`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = ["groups.name = groups.description"];
    const filter_conds: string[] = ["groups.name LIKE '%?%'"];
    //=============================================
    const indexFields = ["groups.name", "groups._id"];
    const cursor = { "groups.name": "Some Group", "groups._id": 1214355 };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);

    const cursor_conds: string[] = [whereCond.whereCond];
    //=============================================
    const order_col_names: string[] = ["name"];
    const join_separators = undefined;
    const limit = undefined;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description) SELECT groups.name, groups_extra.info, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, groups_extra, tab_total_count WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description AND ${whereCond.whereCond} UNION ALL SELECT '' AS name, '' AS info, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC, name`)
  });

  test(`checking getGetRowsCoreSql() method - test #11`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = ["groups.name = groups.description"];
    const filter_conds: string[] = ["groups.name LIKE '%?%'"];
    //=============================================
    const indexFields = ["groups.name", "groups._id"];
    const cursor = { "groups.name": "Some Group", "groups._id": 1214355 };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);

    const cursor_conds: string[] = [whereCond.whereCond];
    //=============================================
    const order_col_names: string[] = ["name"];
    const join_separators = undefined;
    const limit = 10;
    const offset = undefined;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description) SELECT groups.name, groups_extra.info, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, groups_extra, tab_total_count WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description AND ${whereCond.whereCond} UNION ALL SELECT '' AS name, '' AS info, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC, name LIMIT ${limit}`)
  });

  test(`checking getGetRowsCoreSql() method - test #12`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = ["groups.name = groups.description"];
    const filter_conds: string[] = ["groups.name LIKE '%?%'"];
    //=============================================
    const indexFields = ["groups.name", "groups._id"];
    const cursor = { "groups.name": "Some Group", "groups._id": 1214355 };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);

    const cursor_conds: string[] = [whereCond.whereCond];
    //=============================================
    const order_col_names: string[] = ["name"];
    const join_separators = undefined;
    const limit = 10;
    const offset = 2;
    const count_name = undefined;
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_count AS (SELECT COUNT(*) AS total_count FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description) SELECT groups.name, groups_extra.info, tab_total_count.total_count, COUNT(*) OVER() count FROM groups, groups_extra, tab_total_count WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description AND ${whereCond.whereCond} UNION ALL SELECT '' AS name, '' AS info, tab_total_count.total_count, NULL AS count FROM tab_total_count ORDER BY count DESC, name LIMIT ${limit} OFFSET 2`)
  });

  test(`checking getGetRowsCoreSql() method - test #13`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = ["groups.name = groups.description"];
    const filter_conds: string[] = ["groups.name LIKE '%?%'"];
    //=============================================
    const indexFields = ["groups.name", "groups._id"];
    const cursor = { "groups.name": "Some Group", "groups._id": 1214355 };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);

    const cursor_conds: string[] = [whereCond.whereCond];
    //=============================================
    const order_col_names: string[] = ["name"];
    const join_separators = undefined;
    const limit = 10;
    const offset = 2;
    const count_name = "xxx";
    const withClauseCntent = undefined;
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH tab_total_${count_name} AS (SELECT COUNT(*) AS total_${count_name} FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description) SELECT groups.name, groups_extra.info, tab_total_${count_name}.total_${count_name}, COUNT(*) OVER() ${count_name} FROM groups, groups_extra, tab_total_${count_name} WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description AND ${whereCond.whereCond} UNION ALL SELECT '' AS name, '' AS info, tab_total_${count_name}.total_${count_name}, NULL AS ${count_name} FROM tab_total_${count_name} ORDER BY ${count_name} DESC, name LIMIT ${limit} OFFSET 2`)
  });

  test(`checking getGetRowsCoreSql() method - test #14`, () => {
    const dbMan = new DBDataMovieManagerCyberlink(
      {} as Knex<Record<string, unknown>, unknown[]>
    );
    const table_names = ["groups", "groups_extra"];
    const column_names = ["groups.name", "groups_extra.info"];
    const cond_col_names: string[] = ["groups.name"];
    const cond_col_values: unknown[] = [[null, "Robin", "Hood"]];
    const join_conds: string[] = ["groups._id = groups_extra._id"];
    const extra_conds: string[] = ["groups.name = groups.description"];
    const filter_conds: string[] = ["groups.name LIKE '%?%'"];
    //=============================================
    const indexFields = ["groups.name", "groups._id"];
    const cursor = { "groups.name": "Some Group", "groups._id": 1214355 };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);

    const cursor_conds: string[] = [whereCond.whereCond];
    //=============================================
    const order_col_names: string[] = ["name"];
    const join_separators = undefined;
    const limit = 10;
    const offset = 2;
    const count_name = "xxx";
    const withClauseCntent = "aaa AS (SELECT * FROM table1)";
    let paramIndex = 0;
    const sql = dbMan["getGetRowsCoreSql"](table_names, column_names, cond_col_names, cond_col_values, join_conds, extra_conds, filter_conds, cursor_conds, order_col_names, join_separators, limit, offset, count_name, withClauseCntent);
    expect(sql).toBe(`WITH ${withClauseCntent}, tab_total_${count_name} AS (SELECT COUNT(*) AS total_${count_name} FROM groups, groups_extra WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description) SELECT groups.name, groups_extra.info, tab_total_${count_name}.total_${count_name}, COUNT(*) OVER() ${count_name} FROM groups, groups_extra, tab_total_${count_name} WHERE (groups.name IN (${dbMan["getSQLParameter"](paramIndex++)}, ${dbMan["getSQLParameter"](paramIndex++)}) OR groups.name IS NULL) AND groups._id = groups_extra._id AND groups.name LIKE '%?%' AND groups.name = groups.description AND ${whereCond.whereCond} UNION ALL SELECT '' AS name, '' AS info, tab_total_${count_name}.total_${count_name}, NULL AS ${count_name} FROM tab_total_${count_name} ORDER BY ${count_name} DESC, name LIMIT ${limit} OFFSET 2`)
  });

});
