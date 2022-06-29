import DEBUG from "debug";

const debug_db = DEBUG.debug("backend:DB");

import { MissingLastIdError } from "../common/errors";
import { DB } from "./db-db";
import { DBTable } from "./db-table";
import { AppPlatformType } from "../common/types";
import { DBcldb } from "./db-db-cldb";
import { DBextra } from "./db-db-extra";
import { DBmedia_scanner_cache } from "./db-db-media-scanner-cache";
import { DBmoviemedia } from "./db-db-moviemedia";
import { DBplaylist } from "./db-db-playlist";
import knx, { Knex } from "knex";

import {
  getCyberlinkPathBase,
  getCyberlinkRootDBPath,
} from "./db-path-cyberlink";
import { DBDataMovieManagerKnexBase } from "./db-data-moviemanager-knexs-base";

export interface IBetterSQqliteRunReturn {
  changes?: number;
  lastInsertRowid?: number;
}

const appPlatform: AppPlatformType = "cyberlink";

export class DBDataMovieManagerCyberlink extends DBDataMovieManagerKnexBase {
  constructor(knex: Knex) {
    super(
      new DBcldb(appPlatform),
      new DBextra(appPlatform),
      new DBmedia_scanner_cache(appPlatform),
      new DBmoviemedia(appPlatform),
      new DBplaylist(appPlatform),
      knex
    );
  }

  private _createMapDBFile(): Map<string, string> {
    const map = new Map<string, string>();
    map.set(this.dbcldb.name, "CLDB2.db");
    map.set(this.dbmoviemedia.name, "moviemedia2.db");
    map.set(this.dbmediaScannerCache.name, "mediaScannerCache2.db");
    map.set(this.dbplaylist.name, "playlist/Playlist2.db");
    map.set(this.dbextra.name, "extra.db");
    return map;
  }

  private static concatPath(path: string, fname: string): string {
    const filepath = path.concat(fname);

    return filepath;
  }

  private async _createAttachDB(db: DB, dbpath: string): Promise<void> {
    // this creates database if it doeasn't exist
    knx({ client: "better-sqlite3", connection: { filename: dbpath } });

    await this.execRetVoid(`ATTACH DATABASE '${dbpath}' AS ${db.name}`);
  }

  private async attachDBCreateTables(db: DB, dbpath: string): Promise<void> {
    await this._createAttachDB(db, dbpath);

    let index = 0;
    let table: DBTable | null;

    while ((table = db.getTable(index++)) !== null) {
      const aSql: string[] = table.getSQLCreateText(
        this._getUseTableSchema(),
        this._getUseIndexSchema()
      );

      for (const sql of aSql) {
        await this.execRetVoid(sql);
      }
    }
  }

  async init(): Promise<DBDataMovieManagerCyberlink> {
    this.ready = false;

    const mapDBFile = this._createMapDBFile();

    const cyberlink_base_path = getCyberlinkPathBase();
    const cyberlink_rootdb_path = getCyberlinkRootDBPath();

    await Promise.all([
      (async () => {
        try {
          const dbpath = mapDBFile.get(this.dbcldb.name);

          if (dbpath === undefined) throw new Error("");

          await this.attachDBCreateTables(
            this.dbcldb,
            DBDataMovieManagerCyberlink.concatPath(cyberlink_base_path, dbpath)
          );
          debug_db(`Connected to the 'CLDB' database.`);
        } catch (e) {
          debug_db(`Connecting 'CLDB' database failed`);
          throw e;
        }
      })(),
      (async () => {
        try {
          const dbpath = mapDBFile.get(this.dbmoviemedia.name);

          if (dbpath === undefined) throw new Error("");

          await this.attachDBCreateTables(
            this.dbmoviemedia,
            DBDataMovieManagerCyberlink.concatPath(cyberlink_base_path, dbpath)
          );
          debug_db(`Connected to the 'moviemedia' database.`);
        } catch (e) {
          debug_db(`Connecting 'moviemedia' database failed`);
          throw e;
        }
      })(),
      (async () => {
        try {
          const dbpath = mapDBFile.get(this.dbmediaScannerCache.name);

          if (dbpath === undefined) throw new Error("");

          await this.attachDBCreateTables(
            this.dbmediaScannerCache,
            DBDataMovieManagerCyberlink.concatPath(cyberlink_base_path, dbpath)
          );
          debug_db(`Connected to the 'mediaScannerCache' database.`);
        } catch (e) {
          debug_db(`Connecting 'mediaScannerCache' database failed`);
          throw e;
        }
      })(),
      (async () => {
        try {
          const dbpath = mapDBFile.get(this.dbplaylist.name);

          if (dbpath === undefined) throw new Error("");

          await this.attachDBCreateTables(
            this.dbplaylist,
            DBDataMovieManagerCyberlink.concatPath(cyberlink_base_path, dbpath)
          );
          debug_db(`Connected to the 'playlist' database.`);
        } catch (e) {
          debug_db(`Connecting 'playlist' database failed`);
          throw e;
        }
      })(),
      (async () => {
        try {
          const dbpath = mapDBFile.get(this.dbextra.name);

          if (dbpath === undefined) throw new Error("");

          await this.attachDBCreateTables(
            this.dbextra,
            DBDataMovieManagerCyberlink.concatPath(
              cyberlink_rootdb_path,
              dbpath
            )
          );
          debug_db(`Connected to the 'extra' database.`);
        } catch (e) {
          debug_db(`Connecting 'extra' database failed`);
          throw e;
        }
      })(),
    ]);

    this.ready = true;
    return this;
  }

  protected async execQuery(
    sql: string,
    ...params: unknown[]
  ): Promise<Record<string, unknown>[]> {
    if (DBDataMovieManagerCyberlink.count > 0) {
      console.log(
        `execQuery(): CNT=${DBDataMovieManagerCyberlink.count} sql=${sql}`
      );
      DBDataMovieManagerCyberlink.count--;
    }

    return await this.knex.raw(sql, params as Knex.RawBinding);
  }

  // to make "raw" spyable
  private async _rawExecRetID(
    sql: string,
    bindings: readonly Knex.RawBinding[]
  ): Promise<Knex.Raw<IBetterSQqliteRunReturn>> {
    return await this.knex.raw(sql, bindings as Knex.RawBinding);
  }

  //
  // Each entry in most SQLite tables (except for WITHOUT ROWID tables) has a unique 64-bit signed integer key called the "rowid".
  // The rowid is always available as an undeclared column named ROWID, OID, or _ROWID_ as long as those names are not also used by
  // explicitly declared columns. If the table has a column of type INTEGER PRIMARY KEY then that column is another alias for the rowid.
  //
  protected async execRetID(
    id: string,
    sql: string,
    ...params: unknown[]
  ): Promise<number> {
    if (DBDataMovieManagerCyberlink.count > 0) {
      console.log(
        `execRetID(): CNT=${DBDataMovieManagerCyberlink.count} sql=${sql}`
      );
      DBDataMovieManagerCyberlink.count--;
    }

    //    const info: IBetterSQqliteRunReturn = await this.knex.raw(sql, params as Knex.RawBinding);
    const info: IBetterSQqliteRunReturn = await this._rawExecRetID(
      sql,
      params as Knex.RawBinding[]
    );

    if (info.lastInsertRowid) return info.lastInsertRowid;
    else throw new MissingLastIdError("Missing lastInsertRowid");
  }

  protected async execRetVoid(
    sql: string,
    ...params: unknown[]
  ): Promise<void> {
    if (DBDataMovieManagerCyberlink.count > 0) {
      DBDataMovieManagerCyberlink.count--;
    }

    await this.knex.raw(sql, params as Knex.RawBinding);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected getSQLParameter(index: number): string {
    return `?`;
  }

  //=====================
  static count: number;
  static armReport(count: number): void {
    DBDataMovieManagerCyberlink.count = count;
  }
}
