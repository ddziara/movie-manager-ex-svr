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
    const cursor = { title: "Some Movie", _id: "MOVIE_C_Some Movie", path:"C:\\Movies" };
    const whereCond = dbMan["_buildSearcWhere"](indexFields, cursor, true, 0);
    expect(whereCond.params).toEqual([cursor["title"], cursor["title"], cursor["_id"], cursor["title"], cursor["_id"], cursor["path"]]);
    expect(whereCond.whereCond).toBe("(title > ? OR title = ? AND _id > ? OR title = ? AND _id = ? AND path > ?)");
  });
});
