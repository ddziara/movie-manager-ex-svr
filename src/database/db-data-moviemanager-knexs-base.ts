import { DBDataMovieManager } from "./db-data-moviemanager";
import { Knex } from "knex";
import { DBcldb } from "./db-db-cldb";
import { DBextra } from "./db-db-extra";
import { DBmedia_scanner_cache } from "./db-db-media-scanner-cache";
import { DBmoviemedia } from "./db-db-moviemedia";
import { DBplaylist } from "./db-db-playlist";

export abstract class DBDataMovieManagerKnexBase extends DBDataMovieManager {
  protected knex: Knex;

  abstract init(): Promise<DBDataMovieManager>;

  protected abstract execQuery(
    sql: string,
    ...params: unknown[]
  ): Promise<Record<string, unknown>[]>;
  protected abstract execRetID(
    id: string,
    sql: string,
    ...params: unknown[]
  ): Promise<number>;
  protected abstract execRetVoid(sql: string, ...params: unknown[]): Promise<void>;
  protected abstract getSQLParameter(index: number): string;

  constructor(
    dbcldb: DBcldb,
    dbextra: DBextra,
    dbmediaScannerCache: DBmedia_scanner_cache,
    dbmoviemedia: DBmoviemedia,
    dbplaylist: DBplaylist,
    knex: Knex
  ) {
    super(dbcldb, dbextra, dbmediaScannerCache, dbmoviemedia, dbplaylist);
    this.knex = knex;
  }

  async uninit(): Promise<void> {
    this.ready = false;
  }
}
